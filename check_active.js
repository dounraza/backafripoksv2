const Table = require('./backend/model/Table');
const { serverSocket, getFreeSits, findPlayerInAllTables, getConnectionStats } = require('./backend/serverSocket');
const sequelize = require('./backend/config/Db');

// We need to simulate the environment or just check if Table.findByPk(22) returns 'omaha'
// and see if the PokerTable constructor would use it.

async function check() {
    try {
        const table = await Table.findByPk(22);
        console.log('DB gameType:', table.gameType);
        
        // Wait, I can't check the *live* instance unless I am in the same process.
        // But I can see if there is any reason it would be different.
        
        // Let's check if the server is still running?
        // Actually, I am Gemini CLI, I am running in the workspace.
        // I'll check if there are any other PokerTable instances that might be created differently.
        
    } catch (err) {
        console.error(err);
    } finally {
        await sequelize.close();
    }
}

check();
