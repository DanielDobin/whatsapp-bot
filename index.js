const { makeWASocket } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Custom logger with child method fix
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  child: () => logger // Critical fix for Baileys
};

async function startBot() {
  try {
    logger.info('Initializing WhatsApp bot...');

    // ================== MongoDB Connection ==================
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      tls: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 20000
    });
    
    logger.info('Connecting to MongoDB...');
    await mongoClient.connect();
    logger.info('✅ MongoDB connection established');
    const db = mongoClient.db('whatsapp-sessions');

    // ================== Session Initialization ==================
    logger.info('Loading session from MongoDB...');
    const { state, saveCreds } = await useMongoDBAuthState(db);

    // ================== WhatsApp Connection ==================
    logger.info('Creating WhatsApp socket...');
    const sock = makeWASocket({
      auth: state,
      logger: logger,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: false,
      generateInitialPreKeys: 5
    });

    // ================== Event Handlers ==================
    sock.ev.on('connection.update', (update) => {
      logger.debug('Connection update:', JSON.stringify(update, null, 2));
      
      if (update.qr) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(update.qr)}`;
        logger.info(`\n\n🚨 SCAN THIS QR CODE: ${qrUrl}\n`);
      }
      
      if (update.connection === 'open') {
        logger.info('✅ WhatsApp authentication successful');
        logger.info('User ID:', state.creds.me?.id);
      }
      
      if (update.connection === 'close') {
        logger.warn('Connection closed:', update.lastDisconnect?.error);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0];
        if (!msg.key.fromMe) {
          logger.info(`📩 New message from ${msg.key.remoteJid}`);
          await sock.sendMessage(msg.key.remoteJid, {
            text: 'Hello! This is an automated response.'
          });
        }
      } catch (error) {
        logger.error('Message handling error:', error);
      }
    });

    // ================== Web Server ==================
    app.get('/', (req, res) => res.send('🤖 WhatsApp Bot Active'));
    app.get('/health', (req, res) => res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      whatsapp: sock.connectionStatus()
    }));

    app.listen(PORT, () => {
      logger.info(`🌐 Server listening on port ${PORT}`);
    });

  } catch (error) {
    logger.error('FATAL INITIALIZATION ERROR:', error);
    process.exit(1);
  }
}

// ================== MongoDB Session Handler ==================
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Initialize fresh session for testing
  await collection.deleteMany({});

  const existingData = await collection.findOne({ _id: 'auth' }) || {};

  return {
    state: {
      creds: existingData.creds || {},
      keys: existingData.keys || {
        preKeys: [],
        sessions: {},
        signedPreKey: {},
        registrationId: 0
      }
    },
    saveCreds: async (creds) => {
      await collection.updateOne(
        { _id: 'auth' },
        { $set: { 
          creds,
          keys: this.state.keys 
        }},
        { upsert: true }
      );
      logger.info('🔐 Session credentials updated in MongoDB');
    }
  };
}

// Start the application
startBot();
