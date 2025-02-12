const { makeWASocket } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI;

async function startBot() {
  try {
    // Connect to MongoDB
    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    console.log('Connected to MongoDB!');

    const db = mongoClient.db('whatsapp-sessions');
    const { state, saveCreds } = await useMongoDBAuthState(db);

    // Initialize WhatsApp connection
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
      getMessage: async () => ({}), // Disable message history
    });

    // QR Code Handler
    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(update.qr)}&size=300&margin=20`;
        console.log('SCAN THIS QR CODE URL:', qrUrl);
      }
      if (update.connection === 'open') {
        console.log('Successfully connected to WhatsApp!');
      }
    });

    // Save credentials to MongoDB
    sock.ev.on('creds.update', saveCreds);

    // Message Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.fromMe) {
        console.log('Received message from:', msg.key.remoteJid);
        await sock.sendMessage(msg.key.remoteJid, { 
          text: 'Hello! This is an automated reply.' 
        });
      }
    });

    // Health check endpoint
    app.get('/', (req, res) => res.send('WhatsApp Bot is Running 🚀'));
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Fatal error during startup:', error);
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
      console.log('Credentials updated in MongoDB');
    }
  };
}

// Start the bot
startBot();
