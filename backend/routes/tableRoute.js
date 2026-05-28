const express = require("express");
const { findAll, findById, isUserInTable, getUserTables } = require("../controllers/tablesController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.get("/", findAll); // Public
router.get("/:id", authAny, findById);
router.get("/in-table/:userId", authAny, isUserInTable);
router.get("/user-tables/:userId", authAny, getUserTables);

module.exports = router;