import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import compression from 'compression';
import { tableManager } from './logic/TableManager.js';
import sequelize from './config/database.js';
import { connectDB } from './config/database.js';
import { initSocket } from './socketService.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/userRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import soldeRoutes from './routes/soldeRoutes.js';

// Désactiver les logs verbeux en production
if (process.env.NODE_ENV === 'production') {
  console.log = () => {};
  console.info = () => {};
}

const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://frontafripoksv2.vercel.app",
  "https://frontafripoksv2.vercel.app/"
];

app.use(cors({
  origin: '*',
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(compression());
app.use(express.json()); 
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/solde', soldeRoutes);

try {
  await connectDB();
  await sequelize.sync();
  console.log('Modèles synchronisés avec la base de données.');
} catch (error) {
  console.error('Erreur fatale lors de l\'initialisation de la base de données :', error);
  process.exit(1);
}

const httpServer = createServer(app);

// Initialize WebSocket Service
initSocket(httpServer, allowedOrigins);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur Poker lancé sur le port ${PORT}`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Le port ${PORT} est déjà utilisé.`);
  } else {
    console.error('Erreur du serveur HTTP:', err);
  }
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Exception non capturée:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse non gérée:', reason);
});
