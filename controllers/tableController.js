import TablePoker from '../models/TablePoker.js';
import HistoriqueMain from '../models/HistoriqueMain.js';
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

export const getHistoriqueByTableId = async (req, res) => {
  try {
    const { id } = req.params;
    const tableData = await TablePoker.findByPk(id);
    
    if (!tableData) {
      return res.status(404).json({ error: 'Table non trouvée' });
    }

    const historique = await HistoriqueMain.findAll({
      where: { table_name: String(tableData.id) }, // Assure-toi que c'est le format stocké
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    res.json(historique);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getHistorique = async (req, res) => {
  try {
    const { tableName } = req.params;
    const historique = await HistoriqueMain.findAll({
      where: { table_name: tableName },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    res.json(historique);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
