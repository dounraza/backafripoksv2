import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import HistoriqueMain from './models/HistoriqueMain.js';
import RevenuRake from './models/RevenuRake.js';
import { tableManager } from './logic/TableManager.js';
import sequelize from './config/database.js';
import { connectDB } from './config/database.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/userRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import soldeRoutes from './routes/soldeRoutes.js';
import TablePoker from './models/TablePoker.js';
import User from './models/User.js';
import Solde from './models/Solde.js';

const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "https://frontafripoksv2.vercel.app",
  "https://frontafripoksv2.vercel.app/"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("CORS blocked origin:", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json()); 
app.use(express.static('public'));

// Logger pour débugger les requêtes sur Railway
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Origin: ${req.get('origin')}`);
  next();
});

// Route de test pour vérifier si le serveur répond
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Serveur Poker est en ligne' });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/solde', soldeRoutes);

// Initialiser la connexion DB et synchroniser les modèles
connectDB().then(async () => {
  try {
    await sequelize.sync(); // Retrait de { alter: true } pour éviter l'erreur de clés multiples
    console.log('Modèles synchronisés avec la base de données.');
  } catch (error) {
    console.error('Erreur lors de la synchronisation des modèles :', error);
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// Middleware d'authentification Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers['authorization'];
  
  if (!token) {
    console.log('Socket connection rejected: Token missing');
    return next(new Error('Authentication error: Token missing'));
  }
  
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
  
  if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not defined in environment variables');
    return next(new Error('Internal server error'));
  }

  jwt.verify(cleanToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log(`Socket connection rejected: Invalid token (${err.message})`);
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.user = decoded; // Stocker les infos user dans le socket
    console.log(`Socket authenticated for user: ${decoded.name}`);
    next();
  });
});

function broadcastTableState(table) {
  table.players.forEach(p => {
    io.to(p.id).emit('tableUpdated', table.getStateForPlayer(p.id));
  });
  // Also notify the lobby about the updated player count
  broadcastLobbyUpdate();
}

function broadcastLobbyUpdate() {
  const tables = tableManager.getAllTables();
  const updateData = tables.map(t => ({
    id: t.id,
    currentPlayers: t.players.length,
    playerNames: t.players.map(p => p.name),
    playerAvatars: t.players.map(p => p.avatarUrl)
  }));
  io.emit('lobbyUpdate', updateData);
}

function setupTableCallbacks(table) {
  if (!table) return;
  if (!table.onUpdate) {
    table.setUpdateCallback(() => broadcastTableState(table));
  }
  // Enregistrement historique
  if (!table.onHandEnd) {
    table.setHandEndCallback(async (playersData, rake) => {
      try {
        const historique = await HistoriqueMain.create({
          table_name: table.id,
          cartes_communaute: table.communityCards.map(c => c.value + c.suit),
          main_joueurs: table.players.filter(p => p.status !== 'out').map(p => ({
            pseudo: p.name,
            cards: p.cards.map(c => c.value + c.suit)
          })),
          rake: rake
        });
        
        if (rake > 0) {
          const now = new Date();
          await RevenuRake.create({
            montant: rake,
            historiqueMainId: historique.id,
            date: now,
            month: now.getMonth() + 1, // Janvier = 0
            year: now.getFullYear()
          });
        }
        
        console.log(`Historique et RevenuRake enregistrés pour la table ${table.id} avec un rake de ${rake}`);
      } catch (err) {
        console.error('Erreur lors de l\'enregistrement de l\'historique et du rake:', err);
      }
    });
  }
}

let onlinePlayers = 0;

io.on('connection', (socket) => {
  onlinePlayers++;
  io.emit('onlineCount', onlinePlayers);
  console.log('Un joueur authentifié s\'est connecté :', socket.user.name, 'Socket ID:', socket.id, 'Total:', onlinePlayers);

  socket.on('joinTable', async ({ tableId, buyIn }) => {
    const playerName = socket.user.name; // Sécurisé : on utilise le nom du token JWT
    const sTableId = String(tableId);
    let table = tableManager.getTable(sTableId);

    if (!table) {
      try {
        const tableData = await TablePoker.findByPk(sTableId);
        if (tableData) {
          table = tableManager.createTable(sTableId, {
            smallBlind: parseFloat(tableData.smallBlind),
            bigBlind: parseFloat(tableData.bigBlind),
            minBuyIn: parseFloat(tableData.cave),
            gameType: tableData.gameType
          });
          console.log(`Nouvelle table logique créée : ${sTableId}`);
          setupTableCallbacks(table); 
        } else if (sTableId === 'default-table') {
          table = tableManager.getTable('default-table');
          setupTableCallbacks(table); 
        }
      } catch (err) {
        console.error('Erreur lors de la recherche de la table:', err);
      }
    } else {
      setupTableCallbacks(table);
    }

    if (!table) {
      console.log(`Table non trouvée: ${sTableId}`);
      return socket.emit('error', { message: 'Table non trouvée' });
    }

    // Utilisation d'une transaction pour garantir l'intégrité du solde
    const t = await sequelize.transaction();
    try {
      const user = await User.findOne({ 
        where: { name: playerName },
        include: [{ model: Solde }],
        transaction: t,
        lock: t.LOCK.UPDATE // Empêcher d'autres modifications simultanées
      });

      if (!user) {
        await t.rollback();
        console.log(`Utilisateur non trouvé: ${playerName}`);
        return socket.emit('error', { message: 'Utilisateur non trouvé' });
      }

      // Check if player is already at the table
      const existingPlayer = table.players.find(p => p.name === playerName);
      if (existingPlayer) {
        const addAmount = parseInt(buyIn) || 0;
        if (addAmount > 0) {
            if (parseFloat(user.Solde.montant) < addAmount) {
                await t.rollback();
                return socket.emit('error', { message: `Solde insuffisant pour recharger. Vous avez ${user.Solde.montant} MGA` });
            }
            // Déduire du solde et ajouter aux jetons
            user.Solde.montant = parseFloat(user.Solde.montant) - addAmount;
            await user.Solde.save({ transaction: t });
            existingPlayer.chips += addAmount;
            console.log(`Recharge de ${playerName}: +${addAmount} MGA. Nouveaux jetons: ${existingPlayer.chips}`);
        }
        
        await t.commit();
        console.log(`Reconnexion/Recharge de ${playerName} (Socket ID mis à jour: ${socket.id})`);
        // UPDATE CRITIQUE: Mettre à jour l'ID dans la logique de la table aussi
        existingPlayer.id = socket.id; 
        socket.join(tableId);

        // Si la table était en attente, on vérifie si on peut lancer une main
        if (table.gameState === 'waiting' && table.players.filter(p => p.chips > 0).length >= 2) {
            console.log(`Lancement automatique de la main après recharge de ${playerName}`);
            table.startHand();
        }

        broadcastTableState(table);
        return;
      }

      if (!user.Solde) {
        await t.rollback();
        console.log(`Solde non trouvé pour l'utilisateur: ${playerName}`);
        return socket.emit('error', { message: 'Compte solde non trouvé' });
      }

      const initialChips = parseInt(buyIn) || 0;
      if (initialChips > 0 && initialChips < table.minBuyIn) {
        await t.rollback();
        return socket.emit('error', { message: `Le montant minimum pour cette table est de ${table.minBuyIn} MGA` });
      }

      if (initialChips > 0 && parseFloat(user.Solde.montant) < initialChips) {
        await t.rollback();
        return socket.emit('error', { message: `Solde insuffisant. Vous avez ${user.Solde.montant} MGA` });
      }

      if (initialChips > 0) {
        // Déduire le montant du solde
        user.Solde.montant = parseFloat(user.Solde.montant) - initialChips;
        await user.Solde.save({ transaction: t });
        console.log(`Solde mis à jour pour ${playerName}: -${initialChips} MGA (Nouveau: ${user.Solde.montant})`);
      }

      const player = table.addPlayer(socket.id, playerName, initialChips, user.avatar_url);
      if (player.error) {
        await t.rollback();
        console.log(`Erreur joinTable: ${player.error}`);
        return socket.emit('error', { message: player.error });
      }

      await t.commit();
      socket.join(tableId);
      console.log(`${playerName} a rejoint la table ${tableId}. Joueurs actuels: ${table.players.length}`);

      // Notification CRITIQUE pour le lobby
      broadcastLobbyUpdate();
      
      // Notification pour la table
      broadcastTableState(table);

      if (table.players.length >= 2 && table.gameState === 'waiting') {
        table.startHand();
        broadcastTableState(table);
      }
    } catch (err) {
      if (t && !t.finished) {
        await t.rollback();
      }
      console.error('Détails de l\'erreur joinTable:', err);
      socket.emit('error', { message: `Erreur serveur: ${err.message}` });
    }
  });

  const returnChipsToUser = async (playerName, chips) => {
    if (chips <= 0) return;
    const t = await sequelize.transaction();
    try {
      const user = await User.findOne({
        where: { name: playerName },
        include: [{ model: Solde }],
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (user && user.Solde) {
        user.Solde.montant = parseFloat(user.Solde.montant) + chips;
        await user.Solde.save({ transaction: t });
        await t.commit();
        console.log(`Jetons retournés à ${playerName}: +${chips} MGA (Nouveau: ${user.Solde.montant})`);
      } else {
        await t.rollback();
      }
    } catch (err) {
      await t.rollback();
      console.error(`Erreur lors du retour des jetons pour ${playerName}:`, err);
    }
  };

  socket.on('leaveTable', async ({ tableId }) => {
    const table = tableManager.getTable(tableId);
    if (table) {
      const result = table.removePlayer(socket.id);
      if (result) {
        await returnChipsToUser(result.name, result.chips);
      }
      socket.leave(tableId);
      console.log(`Joueur ${socket.id} a quitté la table ${tableId}`);
      broadcastTableState(table);
    }
  });

  socket.on('playerAction', ({ tableId, action, amount }) => {
    const table = tableManager.getTable(tableId);
    if (!table) return;

    const result = table.handleAction(socket.id, action, amount);
    if (result.error) {
      return socket.emit('error', { message: result.error });
    }

    broadcastTableState(table);
  });

  socket.on('chatMessage', ({ tableId, playerName, message }) => {
    io.to(tableId).emit('newChatMessage', {
      playerName,
      message,
      timestamp: Date.now()
    });
  });

  socket.on('emoji', ({ tableId, emoji }) => {
    io.to(tableId).emit('newEmoji', {
      playerName: socket.user.name,
      emoji,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', async () => {
    onlinePlayers--;
    io.emit('onlineCount', onlinePlayers);
    console.log('Joueur déconnecté :', socket.id, 'Total:', onlinePlayers);
    
    // Miandry 5 segondra vao manaisotra ny mpilalao (Grace period for refresh)
    setTimeout(async () => {
      const tables = tableManager.getAllTables();
      for (const table of tables) {
        // Jereo raha mbola ilay socket ID taloha no ao (izany hoe mbola tsy nanao rejoin izy)
        const player = table.players.find(p => p.id === socket.id);
        if (player) {
          const result = table.removePlayer(socket.id);
          if (result) {
            await returnChipsToUser(result.name, result.chips);
            broadcastTableState(table);
          }
        }
      }
    }, 5000); // 5 segondra malalaka tsara hanaovana refresh
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur Poker lancé sur le port ${PORT}`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Le port ${PORT} est déjà utilisé. Veuillez fermer le processus qui l'utilise ou changer de port.`);
  } else {
    console.error('Erreur du serveur HTTP:', err);
  }
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Exception non capturée (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse non gérée (Unhandled Rejection):', reason);
});
