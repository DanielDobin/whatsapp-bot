const { makeWASocket, initAuthCreds, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Use WhatsApp-approved browser configuration
const BROWSER_CONFIG = ['Ubuntu', 'Chrome', '122.0.0.0'];
const WA_VERSION = [2, 2413, 1];

async function initMongoDB() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    tls: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 30000
  });
  await client.connect();
  return client.db('whatsapp_prod');
}

async function createWhatsAppSession(db) {
  // Initialize fresh session
  const { state, saveCreds } = await useMultiFileAuthState('sessions');
  
  const sock = makeWASocket({
    auth: state,
    version: WA_VERSION,
    browser: BROWSER_CONFIG,
    printQRInTerminal: true,
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
    generateInitialPreKeys: 5,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000
  });

  // QR Code Handler
  sock.ev.on('connection.update', (update) => {
    if (update.qr) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(update.qr)}`;
      console.log(`\n\n🌐 SCAN QR CODE: ${qrUrl}\n`);
    }
  });

  // Session Persistence
  sock.ev.on('creds.update', saveCreds);
  return sock;
}

// Main Application
async function bootstrap() {
  try {
    const db = await initMongoDB();
    const sock = await createWhatsAppSession(db);
    
    app.get('/', (req, res) => res.send('🟢 Bot Active'));
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

bootstrap();
