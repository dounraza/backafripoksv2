import TablePoker from '../models/TablePoker.js';
import { tableManager } from '../logic/TableManager.js';

export const getTables = async (req, res) => {
  try {
    const tables = await TablePoker.findAll();
    
    // Enrich table data with real-time player counts
    const enrichedTables = tables.map(table => {
      // Forcer l'ID en string pour correspondre aux clés de tableManager
      const activeTable = tableManager.getTable(String(table.id));
      return {
        ...table.toJSON(),
        currentPlayers: activeTable ? activeTable.players.length : 0,
        playerNames: activeTable ? activeTable.players.map(p => p.name) : []
      };
    });

    res.json(enrichedTables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
