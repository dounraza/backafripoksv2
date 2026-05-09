const Table = require('./backend/model/Table');
const { serverSocket } = require('./backend/serverSocket');
const sequelize = require('./backend/config/Db');

// We can't access the live serverSocket from a new process.
// So this won't work to check the *active* state of the *other* process.

// However, I can check if there's any code that handles table updates.
// I'll check for any other controller.
