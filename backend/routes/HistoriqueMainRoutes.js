const express = require("express");
const router = express.Router();
const { getAllHistorique, getLastHistoriqueByTable } = require("../controllers/MainHistorique");

router.get("/all", getAllHistorique);
router.get("/table/:tableName/last", getLastHistoriqueByTable);

module.exports = router;
