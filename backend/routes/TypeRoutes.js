const express = require("express");
const { findType, createType, updateType, findTypeAcrtif } = require("../controllers/TypeCryptoController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.get("/type-crypto-money", authAny, findType); 
router.get("/type-crypto-money/actif", findTypeAcrtif); // Laissé public si nécessaire pour le front
router.post("/type-crypto-money", authAny, createType); 
router.put("/type-crypto-money/:id", authAny, updateType); 

module.exports = router;