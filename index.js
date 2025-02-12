const { makeWASocket } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

async function startBot() {
  try {
    const client = new MongoClient(MONGODB_URI, {
      tls: true,
      serverSelectionTimeoutMS: 10000
    });

    await client.connect();
    const db = client.db('whatsapp-sessions');
    
    // TEMPORARY: Reset sessions for testing
    // await db.collection('sessions').deleteMany({});
    
    const { state, saveCreds } = await useMongoDBAuthState(db);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
      getMessage: async () => ({}),
      generateInitialPreKeys: 5,
      syncFullHistory: false
    });

    // ... rest of your existing code ...
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}

// Updated session handler
async function useMongoDBAuthState(db) {
  const collection = db.collection('sessions');
  const existingData = await collection.findOne({ _id: 'auth' }) || {};

  return {
    state: {
      creds: existingData.creds || {},
      keys: existingData.keys || {
        preKeys: [],
        sessions: {},
        signedPreKey: {},
        registrationId: 0
      }
    },
    saveCreds: async (creds) => {
      await collection.updateOne(
        { _id: 'auth' },
        { $set: { 
          creds,
          keys: this.state.keys 
        }},
        { upsert: true }
      );
    }
  };
}
