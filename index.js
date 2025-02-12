const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');
const path = require('path');

// Delete sessions folder on startup (for testing)
const sessionDir = path.join(__dirname, 'sessions');
if (fs.existsSync(sessionDir)) {
  fs.rmSync(sessionDir, { recursive: true, force: true });
}




async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('sessions');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });


sock.ev.on('connection.update', (update) => {
  if (update.qr) {
    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(update.qr)}&size=300&margin=20`;
    console.log('Scan this QR code URL:', qrUrl);
  }
  if (update.connection === 'open') {
    console.log('Connected to WhatsApp!');
  }
});

  sock.ev.on('creds.update', saveCreds);

  app.get('/', (req, res) => res.send('Bot is running 🚀'));
  app.listen(PORT, () => console.log(`Server on port ${PORT}`));
}

startBot().catch(console.error);


