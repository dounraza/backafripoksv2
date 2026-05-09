const express = require("express");
const { findAll,findById, isUserInTable } = require("../controllers/tablesController");
const router = express.Router();

router.get("/tables", findAll);
router.get("/tables/:id", findById);
router.get("/tables/in-table/:userId", isUserInTable);

module.exports = router;