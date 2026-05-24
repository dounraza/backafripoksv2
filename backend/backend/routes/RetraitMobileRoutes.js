const express = require("express");
const { retrait, findByPseudo, findByEtat, findAll, transaction, findAllDesc } = require("../controllers/RetraitMobileMoneyController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.post("/mobile-money", authAny, retrait); 
router.get("/mobile-money", authAny, findAll); 
router.get("/mobile-money/desc", authAny, findAllDesc); 
router.get("/mobile-money/:pseudo", authAny, findByPseudo); 
router.get("/mobile-money/etat/:etat", authAny, findByEtat); 
router.post("/mobile-money/transaction/:id", authAny, transaction); 

module.exports = router;