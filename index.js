const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const app = express();
const PORT = process.env.PORT || 3000;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('sessions');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('connection.update', (update) => {
    if (update.qr) {
      qrcode.generate(update.qr, { small: true });
      console.log(`QR code for pairing: ${update.qr}`);
    }
    if (update.connection === 'open') console.log('WhatsApp connected!');
  });

  sock.ev.on('creds.update', saveCreds);

  app.get('/', (req, res) => res.send('Bot is running 🚀'));
  app.listen(PORT, () => console.log(`Server on port ${PORT}`));
}

startBot().catch(console.error);
