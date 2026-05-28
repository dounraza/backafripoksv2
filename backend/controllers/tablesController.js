const asyncHandler = require("express-async-handler");
const Table = require("../model/Table");
const serverSocket = require("../serverSocket");
const playerTablesMap = require("../game/playerTables");

exports.findAll = asyncHandler(async (req, res)=> {
    try {
        const tables = await Table.findAll();
        const tableIds = tables.map(t => t.id);
        let occupiedSeatsMap = serverSocket.getFreeSits(tableIds);
        
        // S'assurer que occupiedSeatsMap est une Map valide
        if (!occupiedSeatsMap || typeof occupiedSeatsMap.get !== 'function') {
            occupiedSeatsMap = new Map();
        }
        
        const dataWithActiveInfo = tables.map(t => {
            const tableData = t.toJSON();
            const activeTable = serverSocket.findTable(String(t.id));
            if (activeTable) {
                tableData.activeGameType = activeTable.gameType;
            }
            return tableData;
        });

        // Remplir les sièges par défaut si manquant
        tables.forEach(t => {
            if (occupiedSeatsMap.get(t.id) === undefined) {
                occupiedSeatsMap.set(t.id, 9);
            }
        });
        
        const occupiedSeats = Object.fromEntries(occupiedSeatsMap);
        
        res.json({message: "all", data: dataWithActiveInfo, occupiedSeats});
    } catch (error) {
        console.error('[TABLES CONTROLLER ERROR]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });   
    }
});

exports.findById = asyncHandler(async (req, res)=> {
    try {
        const tables = await Table.findByPk(req.params.id);
        res.json({message: "table", data: tables});
    } catch (error) {
        console.error('[TABLES CONTROLLER ERROR]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });   
    }
});

exports.isUserInTable = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const playerTables = playerTablesMap.get(Number(userId));
        console.log('[USER IN TABLE] result', playerTablesMap);
        
        console.log('[USER IN TABLE] user id', userId);
        console.log('[USER IN TABLE] player table', playerTables);
        
        res.json(playerTables !== undefined && playerTables.length > 0);
    } catch (error) {
      console.error('[USER IN TABLE] ERR', error);
    }
})

exports.getUserTables = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        const tableIds = playerTablesMap.get(Number(userId)) || [];
        
        const tables = await Promise.all(tableIds.map(async (tid) => {
            const tableInfo = await Table.findByPk(tid);
            return {
                id: tid,
                name: tableInfo?.name || 'Table inconnue',
                cave: tableInfo?.cave || 0
            };
        }));
        
        res.json({ success: true, data: tables });
    } catch (error) {
        console.error('[GET USER TABLES] ERR', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});