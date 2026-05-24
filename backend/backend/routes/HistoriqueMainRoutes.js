const express = require("express");
const router = express.Router();
const { getAllHistorique, getLastHistoriqueByTable } = require("../controllers/MainHistorique");
const { authAny } = require("../middleware/adminAuthMiddleware");

router.get("/all", authAny, getAllHistorique);
router.get("/table/:tableName/last", authAny, getLastHistoriqueByTable);
router.get("/last/:tableName", authAny, getLastHistoriqueByTable);
router.get("/last-history/:tableName", authAny, getLastHistoriqueByTable);

module.exports = router;