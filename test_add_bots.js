import { tableManager } from './logic/TableManager.js';

// Fonction pour ajouter des joueurs fictifs à une table donnée
export const addBots = (tableId, count = 3) => {
    const table = tableManager.tables.find(t => t.id == tableId);
    if (!table) return "Table introuvable";

    for (let i = 0; i < count; i++) {
        const botId = `bot_${Date.now()}_${i}`;
        const botName = `Bot_${i + 1}`;
        table.addPlayer(botId, botName, 5000);
    }
    table.notify();
    return `Ajouté ${count} bots à la table ${tableId}`;
};

// Fonction pour définir manuellement la position d'un joueur
export const setPlayerPosition = (tableId, playerName, position) => {
    const table = tableManager.tables.find(t => t.id == tableId);
    if (!table) return "Table introuvable";

    const player = table.players.find(p => p.name === playerName);
    if (!player) return "Joueur introuvable";

    player.position = position;
    table.sortPlayers();
    table.notify();
    return `Position du joueur ${playerName} définie à ${position}`;
};
