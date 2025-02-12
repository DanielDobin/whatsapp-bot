const { makeWASocket } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced logging setup
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

async function startBot() {
  try {
    logger.info('Starting WhatsApp bot...');

    // ================== MongoDB Connection ==================
    const client = new MongoClient(process.env.MONGODB_URI, {
      tls: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 20000
    });
    
    logger.info('Connecting to MongoDB...');
    await client.connect();
    logger.info('✅ MongoDB connected');
    const db = client.db('whatsapp-sessions');

    // ================== Session Management ==================
    logger.info('Initializing session...');
    const { state, saveCreds } = await useMongoDBAuthState(db);
    
    // ================== WhatsApp Connection ==================
    logger.info('Creating WhatsApp socket...');
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: logger,
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: false,
      generateInitialPreKeys: 5
    });

    // ================== Event Handlers ==================
    sock.ev.on('connection.update', (update) => {
      logger.debug('Connection update:', update);
      
      if (update.qr) {
        const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(update.qr)}&size=400`;
        logger.info(`🚨 SCAN THIS QR CODE: ${qrUrl}`);
        logger.info(`QR Code Content: ${update.qr}`); // For manual scanning
      }
      
      if (update.connection === 'open') {
        logger.info('✅ WhatsApp connection established');
      }
      
      if (update.connection === 'close') {
        logger.warn('Connection closed:', update.lastDisconnect?.error);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // ================== Web Server ==================
    app.get('/', (req, res) => res.send('Bot is running'));
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

  } catch (error) {
    logger.error('FATAL ERROR:', error);
    process.exit(1);
  }
}

// ================== MongoDB Auth Handler ==================
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Force new session for testing
  await collection.deleteMany({}); // Remove this line after first successful connection
  
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
        { $set: { creds, keys: this.state.keys } },
        { upsert: true }
      );
    }
  };
}

// Start the application
startBot();
