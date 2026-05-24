const express = require("express");
const { retrait, findByPseudo, findByEtat, findAll, transaction, findAllDesc } = require("../controllers/RetraitCryptoMoneyController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.post("/crypto-money", authAny, retrait); 
router.get("/crypto-money", authAny, findAll); 
router.get("/crypto-money/desc", authAny, findAllDesc); 
router.get("/crypto-money/:pseudo", authAny, findByPseudo); 
router.get("/crypto-money/etat/:etat", authAny, findByEtat); 
router.post("/crypto-money/transaction/:id", authAny, transaction); 

module.exports = router;