const Table = require('./backend/model/Table');
const sequelize = require('./backend/config/Db');

async function checkTable() {
    try {
        const table = await Table.findByPk(22);
        if (table) {
            console.log('TABLE 22 INFO:', JSON.stringify(table.toJSON(), null, 2));
        } else {
            console.log('TABLE 22 NOT FOUND');
        }
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await sequelize.close();
    }
}

checkTable();
