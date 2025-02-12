const { makeWASocket, initAuthCreds, DisconnectReason } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Production-grade Logger
const logger = {
  trace: (...args) => console.log('[TRACE]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  fatal: (...args) => console.error('[FATAL]', ...args),
  child: () => logger
};

// 2. Robust Session Management
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Force fresh session initialization
  await collection.deleteMany({});
  
  const defaultKeys = {
    preKeys: [],
    sessions: {},
    signedPreKey: {
      keyPair: {
        public: Buffer.alloc(32),
        private: Buffer.alloc(32)
      }
    },
    registrationId: 0
  };

  return {
    state: {
      creds: initAuthCreds(),
      keys: defaultKeys
    },
    saveCreds: async (creds) => {
      await collection.updateOne(
        { _id: 'auth' },
        { $set: { creds, keys: defaultKeys } },
        { upsert: true }
      );
    }
  };
}

// 3. Enhanced WhatsApp Connection
async function createWhatsAppConnection(db) {
  try {
    const { state, saveCreds } = await useMongoDBAuthState(db);

    const sock = makeWASocket({
      auth: state,
      logger,
      version: [2, 2413, 1],
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      shouldSyncHistory: () => false,
      shouldIgnoreJid: () => true,
      generateInitialPreKeys: 5,
      getMessage: async () => undefined
    });

    // QR Code Handling with Fallback
    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(update.qr)}`;
        const qrTerminal = `
          █▀▀▀▀▀█ ▀▀▀█▄█  ▀▄▄ ▄▀█  █▀▀▀▀▀█
          █ ███ █ ▄▀▀▄▄▄▄▀▀█▄ █▄█  █ ███ █
          █ ▀▀▀ █ █▄ ▀ ▀ ▀▀▀█▄▄▀█  █ ▀▀▀ █
          ▀▀▀▀▀▀▀ ▀▄▀ ▀ ▀ █▄█ █ ▀ ▀▀▀▀▀▀▀
          ${update.qr}
        `;
        logger.info(`\n\n🌐 QR CODE URL: ${qrUrl}`);
        logger.info(`\n📲 RAW QR DATA:\n${qrTerminal}`);
      }
      
      if (update.connection === 'close') {
        handleConnectionClose(update.lastDisconnect?.error);
      }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;

  } catch (error) {
    logger.fatal('Connection initialization failed:', error);
    process.exit(1);
  }
}

// 4. Connection Error Handling
function handleConnectionClose(error) {
  if (error?.output?.statusCode === DisconnectReason.restartRequired) {
    logger.warn('Restart required - session expired');
  } else if (error?.output?.statusCode === DisconnectReason.badSession) {
    logger.error('Invalid session - delete session data and retry');
  } else {
    logger.error('Connection closed:', error);
  }
  process.exit(1);
}

// 5. Main Application Flow
async function bootstrap() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    tls: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 30000
  });

  try {
    await client.connect();
    const db = client.db('whatsapp_prod');
    await createWhatsAppConnection(db);

    app.get('/', (req, res) => res.send('🟢 Bot Operational'));
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

  } catch (error) {
    logger.fatal('Bootstrap failed:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();
