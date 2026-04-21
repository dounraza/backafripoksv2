import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
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
app.use(cors());
app.use(express.json()); 
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
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
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
    playerNames: t.players.map(p => p.name)
  }));
  io.emit('lobbyUpdate', updateData);
}

function setupTableCallbacks(table) {
  if (!table) return;
  if (!table.onUpdate) {
    table.setUpdateCallback(() => broadcastTableState(table));
  }
}

let onlinePlayers = 0;

io.on('connection', (socket) => {
  onlinePlayers++;
  io.emit('onlineCount', onlinePlayers);
  console.log('Un joueur s\'est connecté :', socket.id, 'Total:', onlinePlayers);

  socket.on('joinTable', async ({ tableId, playerName, buyIn }) => {
    const sTableId = String(tableId);
    let table = tableManager.getTable(sTableId);

    if (!table) {
      try {
        const tableData = await TablePoker.findByPk(sTableId);
        if (tableData) {
          table = tableManager.createTable(sTableId, {
            smallBlind: parseFloat(tableData.smallBlind),
            bigBlind: parseFloat(tableData.bigBlind),
            minBuyIn: parseFloat(tableData.cave)
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

    try {
      // FIX: use 'name' instead of 'username' to match User model
      const user = await User.findOne({ 
        where: { name: playerName },
        include: [{ model: Solde }] 
      });

      if (!user) {
        console.log(`Utilisateur non trouvé: ${playerName}`);
        return socket.emit('error', { message: 'Utilisateur non trouvé' });
      }

      // Check if player is already at the table
      const existingPlayer = table.players.find(p => p.name === playerName);
      if (existingPlayer) {
        const addAmount = parseInt(buyIn) || 0;
        if (addAmount > 0) {
            if (parseFloat(user.Solde.montant) < addAmount) {
                return socket.emit('error', { message: `Solde insuffisant pour recharger. Vous avez ${user.Solde.montant} MGA` });
            }
            // Déduire du solde et ajouter aux jetons
            user.Solde.montant = parseFloat(user.Solde.montant) - addAmount;
            await user.Solde.save();
            existingPlayer.chips += addAmount;
            console.log(`Recharge de ${playerName}: +${addAmount} MGA. Nouveaux jetons: ${existingPlayer.chips}`);
        }
        
        console.log(`Reconnexion/Recharge de ${playerName} (Socket ID mis à jour)`);
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
        console.log(`Solde non trouvé pour l'utilisateur: ${playerName}`);
        return socket.emit('error', { message: 'Compte solde non trouvé' });
      }

      const initialChips = parseInt(buyIn) || 0;
      if (initialChips < table.minBuyIn) {
        return socket.emit('error', { message: `Le montant minimum pour cette table est de ${table.minBuyIn} MGA` });
      }

      if (parseFloat(user.Solde.montant) < initialChips) {
        return socket.emit('error', { message: `Solde insuffisant. Vous avez ${user.Solde.montant} MGA` });
      }

      // Déduire le montant du solde
      user.Solde.montant = parseFloat(user.Solde.montant) - initialChips;
      await user.Solde.save();
      console.log(`Solde mis à jour pour ${playerName}: -${initialChips} MGA (Nouveau: ${user.Solde.montant})`);

      if (!table.onUpdate) {
        table.setUpdateCallback(() => broadcastTableState(table));
      }

      const player = table.addPlayer(socket.id, playerName, initialChips);
      if (player.error) {
        user.Solde.montant = parseFloat(user.Solde.montant) + initialChips;
        await user.Solde.save();
        console.log(`Erreur joinTable: ${player.error}. Remboursement.`);
        return socket.emit('error', { message: player.error });
      }

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
      console.error('Détails de l\'erreur joinTable:', err);
      socket.emit('error', { message: `Erreur serveur: ${err.message}` });
    }
  });

  const returnChipsToUser = async (playerName, chips) => {
    if (chips <= 0) return;
    try {
      const user = await User.findOne({
        where: { name: playerName },
        include: [{ model: Solde }]
      });
      if (user && user.Solde) {
        user.Solde.montant = parseFloat(user.Solde.montant) + chips;
        await user.Solde.save();
        console.log(`Jetons retournés à ${playerName}: +${chips} MGA (Nouveau: ${user.Solde.montant})`);
      }
    } catch (err) {
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

  socket.on('disconnect', async () => {
    onlinePlayers--;
    io.emit('onlineCount', onlinePlayers);
    console.log('Joueur déconnecté :', socket.id, 'Total:', onlinePlayers);
    const tables = tableManager.getAllTables();
    for (const table of tables) {
      const result = table.removePlayer(socket.id);
      if (result) {
        await returnChipsToUser(result.name, result.chips);
        broadcastTableState(table);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Serveur Poker lancé sur http://localhost:${PORT}`);
});
