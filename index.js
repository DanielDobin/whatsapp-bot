const { makeWASocket } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI; // Set this in Render's environment variables

async function startBot() {
  try {
    // Configure MongoDB client with TLS
    const client = new MongoClient(MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✅ MongoDB connection established');
    
    const db = client.db('whatsapp-sessions');
    const { state, saveCreds } = await useMongoDBAuthState(db);

    // Initialize WhatsApp connection
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      getMessage: async () => ({}),
    });

    // QR Code Handler
    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(update.qr)}&size=300`;
        console.log('SCAN THIS QR CODE:', qrUrl);
      }
      if (update.connection === 'open') {
        console.log('🚀 WhatsApp connection established');
      }
    });

    // Credentials saver
    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.fromMe) {
        console.log('📩 Received message from:', msg.key.remoteJid);
        await sock.sendMessage(msg.key.remoteJid, {
          text: 'Hello! This is an automated reply.'
        });
      }
    });

    // Health endpoints
    app.get('/', (req, res) => res.send('🤖 WhatsApp Bot Active'));
    app.get('/health', (req, res) => res.json({ 
      status: 'ok',
      mongo: client.topology.isConnected(),
      whatsapp: sock.connectionStatus()
    }));

    app.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('💀 FATAL ERROR:', error);
    process.exit(1);
  }
}

// MongoDB Session Handler
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  
  // Load existing credentials
  const existingCreds = await collection.findOne({ _id: 'creds' }) || {};

  return {
    state: {
      creds: existingCreds,
      keys: {}
    },
    saveCreds: async (creds) => {
      await collection.updateOne(
        { _id: 'creds' },
        { $set: creds },
        { upsert: true }
      );
      console.log('🔐 Credentials saved to MongoDB');
    }
  };
}

// Start the bot
startBot();
