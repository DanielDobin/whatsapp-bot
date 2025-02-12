const { makeWASocket, initAuthCreds } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced logger with QR code display
const logger = {
  trace: (...args) => console.log('[TRACE]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  fatal: (...args) => console.error('[FATAL]', ...args),
  child: () => logger
};

async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Force fresh session for QR generation
  await collection.deleteMany({});
  
  const result = await collection.findOne({ _id: 'auth' }) || {};
  
  return {
    state: {
      creds: result.creds || initAuthCreds(),
      keys: result.keys || {
        preKeys: [],
        sessions: {},
        signedPreKey: {
          keyPair: {
            public: Buffer.from([0]),  // Critical fix
            private: Buffer.from([0])  // Valid empty buffer
          }
        },
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

async function connectToWhatsApp(db) {
  const { state, saveCreds } = await useMongoDBAuthState(db);

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
    version: [2, 2413, 1],
    syncFullHistory: false,
    shouldSyncHistory: () => false,  // Prevent registration attempts
    generateInitialPreKeys: 5
  });

  // QR Code Handler
  sock.ev.on('connection.update', (update) => {
    logger.debug('Connection update:', update);
    
    if (update.qr) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(update.qr)}`;
      logger.info(`\n\n🌐 SCAN THIS QR CODE: ${qrUrl}\n`);
      logger.info(`RAW QR DATA: ${update.qr}\n`);  // Fallback for URL issues
    }
    
    if (update.connection === 'open') {
      logger.info('✅ WhatsApp authentication successful');
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return sock;
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    tls: true,
    serverSelectionTimeoutMS: 15000
  });

  try {
    await client.connect();
    const db = client.db('whatsapp');
    const sock = await connectToWhatsApp(db);

    app.get('/', (req, res) => res.send('Bot Active'));
    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`);
      logger.info('Waiting for QR code scan...');
    });

  } catch (error) {
    logger.fatal('Startup failed:', error);
    process.exit(1);
  }
}

main();
