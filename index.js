// index.js
const { makeWASocket, initAuthCreds } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Enhanced Logger
const logger = {
  trace: (...args) => console.log('[TRACE]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  fatal: (...args) => console.error('[FATAL]', ...args),
  child: () => logger
};

// 2. Fixed Session Handler
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Delete existing sessions for fresh start
  await collection.deleteMany({});

  const result = await collection.findOne({ _id: 'auth' });
  const existingData = result ? result : {};

  // Initialize proper key structure
  const defaultKeys = {
    preKeys: [],
    sessions: {},
    signedPreKey: {
      keyPair: {
        public: Buffer.alloc(0),
        private: Buffer.alloc(0)
      }
    },
    registrationId: 0
  };

  return {
    state: {
      creds: existingData.creds || initAuthCreds(),
      keys: existingData.keys || defaultKeys
    },
    saveCreds: async (creds) => {
      await collection.updateOne(
        { _id: 'auth' },
        { $set: { 
          creds,
          keys: { 
            ...defaultKeys,
            ...this.state.keys 
          }
        }},
        { upsert: true }
      );
      logger.info('Session updated in MongoDB');
    }
  };
}

// 3. WhatsApp Connection
async function connectToWhatsApp(db) {
  try {
    const { state, saveCreds } = await useMongoDBAuthState(db);

    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      version: [2, 2413, 1],
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      syncFullHistory: false,
      generateInitialPreKeys: 5
    });

    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(update.qr)}`;
        logger.info(`\n\n🔍 SCAN QR: ${qrUrl}\n`);
      }
      if (update.connection === 'open') {
        logger.info('✅ WhatsApp authenticated');
      }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;

  } catch (error) {
    logger.fatal('Connection failed:', error);
    process.exit(1);
  }
}

// 4. Main Application
async function main() {
  const mongoClient = new MongoClient(process.env.MONGODB_URI, {
    tls: true,
    serverSelectionTimeoutMS: 15000
  });

  try {
    await mongoClient.connect();
    const db = mongoClient.db('whatsapp');
    const sock = await connectToWhatsApp(db);

    app.get('/', (req, res) => res.send('Bot Active'));
    app.listen(PORT, () => logger.info(`Server running on ${PORT}`));

  } catch (error) {
    logger.fatal('Startup failed:', error);
    process.exit(1);
  }
}

// 5. Start
main();
