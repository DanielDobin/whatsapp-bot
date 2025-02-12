const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Session Configuration
const sessionFolder = path.join(__dirname, 'session');
if (!fs.existsSync(sessionFolder)) {
  fs.mkdirSync(sessionFolder);
}

// 2. WhatsApp Connection Setup
async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Chrome', 'Linux', '120.0.0.0'],
    version: [2, 2412, 12],
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
    generateInitialPreKeys: 5,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 20000
  });

  // 3. QR Code Handler
  sock.ev.on('connection.update', (update) => {
    if (update.qr) {
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(update.qr)}`;
      const qrTerminal = `
        █▀▀▀▀▀█ ▀▀ █ █▀▀▀▀▀█
        █ ███ █ ▀█ ▀ █ ███ █
        █ ▀▀▀ █ ▄▀ █ █ ▀▀▀ █
        ▀▀▀▀▀▀▀ ▀ █ ▀ ▀▀▀▀▀▀▀
        ${update.qr}
      `;
      console.log(`\n🌐 Scan QR: ${qrImageUrl}`);
      console.log(`\n📲 Raw QR Data:\n${qrTerminal}`);
    }
    
    if (update.connection === 'open') {
      console.log('✅ WhatsApp connected!');
      sock.ev.off('connection.update', this);
    }
  });

  // 4. Session Save Handler
  sock.ev.on('creds.update', saveCreds);

  // 5. Error Handling
  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      console.log('Connection closed:', update.lastDisconnect?.error);
      startWhatsApp(); // Auto-reconnect
    }
  });

  return sock;
}

// 6. Web Server
app.get('/', (req, res) => res.send('WhatsApp Bot Active'));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startWhatsApp().catch(err => {
    console.error('Failed to start WhatsApp:', err);
    process.exit(1);
  });
});
