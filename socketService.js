import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { tableManager } from './logic/TableManager.js';
import User from './models/User.js';
import Solde from './models/Solde.js';
import TablePoker from './models/TablePoker.js';
import HistoriqueMain from './models/HistoriqueMain.js';
import RevenuRake from './models/RevenuRake.js';
import sequelize from './config/database.js';

let io;
let onlinePlayers = 0;
const pendingRemovals = new Map(); // { playerName: timeoutId }
const tableUpdateTimers = new Map();

export const initSocket = (httpServer, allowedOrigins) => {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    pingInterval: 30000,
    pingTimeout: 3600000,
    connectTimeout: 3600000
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['authorization'];
    if (!token) return next(new Error('Authentication error: Token missing'));
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    if (!process.env.JWT_SECRET) return next(new Error('Internal server error'));

    jwt.verify(cleanToken, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error: Invalid token'));
      socket.user = decoded;
      next();
    });
  });

  io.on('connection', (socket) => {
    onlinePlayers++;
    io.emit('onlineCount', onlinePlayers);

    socket.on('joinTable', async ({ tableId, buyIn }) => {
      const playerName = socket.user.name?.trim();
      if (!playerName) return socket.emit('error', { message: 'Nom d\'utilisateur invalide' });

      if (pendingRemovals.has(playerName)) {
        clearTimeout(pendingRemovals.get(playerName));
        pendingRemovals.delete(playerName);
      }

      const allTables = tableManager.getAllTables();
      for (const t of allTables) {
        if (t.id !== String(tableId)) {
          const p = t.players.find(p => p.id === socket.id || p.name.trim().toLowerCase() === playerName.toLowerCase());
          if (p) {
            const result = t.removePlayer(p.id);
            if (result) await returnChipsToUser(result.name, result.chips);
            socket.leave(t.id);
            broadcastTableState(t);
          }
        }
      }

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
            setupTableCallbacks(table);
          } else if (sTableId === 'default-table') {
            table = tableManager.getTable('default-table');
            setupTableCallbacks(table);
          }
        } catch (err) {
          console.error('Error finding table:', err);
        }
      } else {
        setupTableCallbacks(table);
      }

      if (!table) return socket.emit('error', { message: 'Table non trouvée' });

      const t = await sequelize.transaction();
      try {
        const user = await User.findOne({ where: { name: playerName }, include: [{ model: Solde }], transaction: t, lock: t.LOCK.UPDATE });
        if (!user) { await t.rollback(); return socket.emit('error', { message: 'Utilisateur non trouvé' }); }

        const initialChips = parseInt(buyIn) || 0;
        const existingPlayer = table.players.find(p => p.name.trim().toLowerCase() === playerName.toLowerCase());

        if (existingPlayer) {
          if (initialChips > 0) {
            if (parseFloat(user.Solde.montant) < initialChips) { await t.rollback(); return socket.emit('error', { message: 'Solde insuffisant' }); }
            user.Solde.montant = parseFloat(user.Solde.montant) - initialChips;
            await user.Solde.save({ transaction: t });
            existingPlayer.chips += initialChips;
            existingPlayer.status = 'active'; // Reset status for rebuy
          }
          await t.commit();
          existingPlayer.id = socket.id;
          socket.join(tableId);
          if (table.gameState === 'waiting' && table.players.filter(p => p.chips > 0).length >= 2) table.startHand();
          broadcastTableState(table);
          return;
        }

        if (parseFloat(user.Solde.montant) < initialChips) { await t.rollback(); return socket.emit('error', { message: 'Solde insuffisant' }); }
        user.Solde.montant = parseFloat(user.Solde.montant) - initialChips;
        await user.Solde.save({ transaction: t });

        const player = table.addPlayer(socket.id, playerName, initialChips, user.avatar_url);
        await t.commit();
        socket.join(tableId);
        broadcastLobbyUpdate();
        broadcastTableState(table);
        if (table.players.length >= 2 && table.gameState === 'waiting') table.startHand();
      } catch (err) {
        if (t && !t.finished) await t.rollback();
        socket.emit('error', { message: `Erreur serveur: ${err.message}` });
      }
    });

    socket.on('leaveTable', async ({ tableId }) => {
      const table = tableManager.getTable(tableId);
      if (table) {
        const result = table.removePlayer(socket.id);
        if (result) await returnChipsToUser(result.name, result.chips);
        socket.leave(tableId);
        broadcastTableState(table);
      }
    });

    socket.on('playerAction', ({ tableId, action, amount }) => {
      const table = tableManager.getTable(tableId);
      if (!table) return;
      const result = table.handleAction(socket.id, action, amount);
      if (result.error) return socket.emit('error', { message: result.error });
      broadcastTableState(table);
    });

    socket.on('chatMessage', ({ tableId, playerName, message }) => {
      io.to(tableId).emit('newChatMessage', { playerName, message, timestamp: Date.now() });
    });

    socket.on('emoji', ({ tableId, emoji }) => {
      io.to(tableId).emit('newEmoji', { playerName: socket.user.name, emoji, timestamp: Date.now() });
    });
socket.on('disconnect', async () => {
  onlinePlayers--;
  io.emit('onlineCount', onlinePlayers);
  const playerName = socket.user?.name?.trim();
  if (!playerName) return;

  console.log(`Joueur déconnecté : ${playerName} (ID: ${socket.id}). Session maintenue à la table.`);
  // Timer removed: Player is no longer automatically removed from the table.
});  });
};

async function returnChipsToUser(playerName, chips) {
  if (chips <= 0) return;
  const t = await sequelize.transaction();
  try {
    const user = await User.findOne({ where: { name: playerName }, include: [{ model: Solde }], transaction: t, lock: t.LOCK.UPDATE });
    if (user && user.Solde) {
      user.Solde.montant = parseFloat(user.Solde.montant) + chips;
      await user.Solde.save({ transaction: t });
      await t.commit();
    } else await t.rollback();
  } catch (err) {
    await t.rollback();
  }
}

function broadcastTableState(table) {
  if (tableUpdateTimers.has(table.id)) return;
  const timer = setTimeout(() => {
    tableUpdateTimers.delete(table.id);
    table.players.forEach(p => io.to(p.id).emit('tableUpdated', table.getStateForPlayer(p.id)));
  }, 100);
  tableUpdateTimers.set(table.id, timer);
}

function broadcastLobbyUpdate() {
  const now = Date.now();
  if (global.lastLobbyUpdate && now - global.lastLobbyUpdate < 2000) return;
  global.lastLobbyUpdate = now;
  const tables = tableManager.getAllTables();
  io.emit('lobbyUpdate', tables.map(t => ({ id: t.id, currentPlayers: t.players.length, playerNames: t.players.map(p => p.name) })));
}

function startRemovalTimer(table, playerName) {
  if (pendingRemovals.has(playerName)) {
    clearTimeout(pendingRemovals.get(playerName));
  }
  
  // Find player socket to notify them with a delay
  const player = table.players.find(p => p.name.trim().toLowerCase() === playerName.toLowerCase());
  if (player) {
      setTimeout(() => {
          io.to(player.id).emit('showRebuyModal');
      }, 5000); // Attendre 5s pour laisser finir les animations avant d'afficher le modal
  }

  const timer = setTimeout(async () => {
    const player = table.players.find(p => p.name.trim().toLowerCase() === playerName.toLowerCase());
    if (player && player.chips === 0) {
      console.log(`Auto-suppression du joueur : ${playerName} après 10s sans recave.`);
      const result = table.removePlayer(player.id);
      if (result) await returnChipsToUser(result.name, result.chips);
      broadcastTableState(table);
      broadcastLobbyUpdate();
      pendingRemovals.delete(playerName);
    }
  }, 10000); // 10 secondes

  pendingRemovals.set(playerName, timer);
}

function setupTableCallbacks(table) {
  if (!table) return;
  if (!table.onUpdate) table.setUpdateCallback(() => {
    broadcastTableState(table);
    if (table.currentPhase === 'pre-flop' && table.gameState === 'waiting') broadcastLobbyUpdate();
  });
  if (!table.onHandEnd) table.setHandEndCallback(async (handData) => {
    try {
      const { players, communityCards, totalRake } = handData;
      const tableData = await TablePoker.findByPk(table.id);
      const tableName = tableData ? tableData.name : table.id;
      
      const allFolded = players.filter(p => p.status === 'folded').map(p => p.name);
      const allWinners = table.winnerInfo ? table.winnerInfo.map(w => w.name) : [];
      const isFoldWin = table.winnerInfo && table.winnerInfo.length === 1 && table.winnerInfo[0].handName === "TOUS LES AUTRES ONT FOLDÉ";
      
      const historique = await HistoriqueMain.create({
        table_name: tableName,
        datetime: new Date(),
        cartes_communaute: communityCards.map(c => c.value + c.suit),
        main_joueurs: players.filter(p => p.status !== 'out').map(p => {
          const isWinner = allWinners.includes(p.name);
          return { 
            pseudo: p.name, 
            cards: (isWinner && isFoldWin) ? [] : p.cards.map(c => c.value + c.suit)
          };
        }),
        foldes: allFolded,
        gagnants: allWinners,
        rake: totalRake
      });
      if (totalRake > 0) {
        const now = new Date();
        await RevenuRake.create({ montant: totalRake, historiqueMainId: historique.id, date: now, month: now.getMonth() + 1, year: now.getFullYear() });
      }

      // Check if any player has 0 chips after hand and start removal timer
      table.players.forEach(player => {
          if (player.chips === 0) {
              startRemovalTimer(table, player.name);
          }
      });
    } catch (err) { console.error('Error saving history:', err); }
  });
}

