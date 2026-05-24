const express = require("express");
const { findAll,findById, isUserInTable } = require("../controllers/tablesController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.get("/", findAll); // Public
router.get("/:id", authAny, findById);
router.get("/in-table/:userId", authAny, isUserInTable);

module.exports = router;