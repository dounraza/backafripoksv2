const express = require("express");
const { allSolde, totalSoldes } = require("../controllers/SoldeController");
const { adminProtect } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.get("/solde-all", adminProtect, allSolde);
router.get("/total-solde", adminProtect, totalSoldes);

module.exports = router;