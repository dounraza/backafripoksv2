import { Table } from './Table.js';

class TableManager {
  constructor() {
    this.tables = new Map();
    // Créer une table par défaut pour le test
    this.createTable('default-table', { maxPlayers: 6 });
  }

  createTable(id, config) {
    const table = new Table(id, config);
    this.tables.set(id, table);
    return table;
  }

  getTable(id) {
    return this.tables.get(id);
  }

  getAllTables() {
    return Array.from(this.tables.values());
  }
}

export const tableManager = new TableManager();
