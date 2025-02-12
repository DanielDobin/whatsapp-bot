// index.js
const { makeWASocket } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Configure Logger
const logger = {
  trace: (...args) => console.trace('[TRACE]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  fatal: (...args) => console.error('[FATAL]', ...args),
  child: () => logger
};

// 2. MongoDB Session Manager
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Initialize fresh session collection
  await collection.deleteMany({});
  
  const existingData = await collection.findOne({ _id: 'auth' }) || {};

  return {
    state: {
      creds: existingData.creds || {},
      keys: existingData.keys || {
        preKeys: [],
        sessions: {},
        signedPreKey: { 
          keyPair: {
            public: Buffer.alloc(0),
            private: Buffer.alloc(0)
          }
        },
        registrationId: 0
      }
    },
    saveCreds: async (creds) => {
      await collection.updateOne(
        { _id: 'auth' },
        { 
          $set: { 
            creds,
            keys: this.state.keys 
          }
        },
        { upsert: true }
      );
      logger.info('Session credentials updated in MongoDB');
    }
  };
}

// 3. WhatsApp Connection Setup
async function connectToWhatsApp(db) {
  try {
    const { state, saveCreds } = await useMongoDBAuthState(db);
    
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      version: [2, 2413, 1],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(update.qr)}`;
        logger.info(`\n\n🔍 SCAN QR CODE: ${qrUrl}\n`);
      }
      if (update.connection === 'open') {
        logger.info('✅ WhatsApp authenticated successfully');
        logger.info('User ID:', state.creds.me?.id);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
  } catch (error) {
    logger.fatal('WhatsApp connection failed:', error);
    process.exit(1);
  }
}

// 4. Main Application
async function main() {
  try {
    // Database Connection
    const mongoClient = new MongoClient(process.env.MONGODB_URI, {
      tls: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 30000
    });
    
    logger.info('Connecting to MongoDB...');
    await mongoClient.connect();
    logger.info('✅ MongoDB connection established');
    const db = mongoClient.db('whatsapp');

    // WhatsApp Connection
    const sock = await connectToWhatsApp(db);

    // Web Server
    app.get('/', (req, res) => res.send('WhatsApp Bot Active'));
    app.get('/health', (req, res) => res.json({
      status: 'ok',
      whatsapp: sock.connectionStatus(),
      timestamp: new Date().toISOString()
    }));

    app.listen(PORT, () => {
      logger.info(`🌐 Server running on port ${PORT}`);
      logger.info('Waiting for QR code scan...');
    });

  } catch (error) {
    logger.fatal('Application failed to start:', error);
    process.exit(1);
  }
}

// 5. Start Application
main();
