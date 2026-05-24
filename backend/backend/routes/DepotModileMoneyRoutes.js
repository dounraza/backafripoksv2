const express = require("express");
const { depot, findByPseudo, findByEtat, findAll, transaction, findAllDesc } = require("../controllers/DepotMobileMoneyController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

router.post("/mobile-money", authAny, depot); 
router.get("/mobile-money", authAny, findAll); 
router.get("/mobile-money/desc", authAny, findAllDesc); 
router.get("/mobile-money/:pseudo", authAny, findByPseudo); 
router.get("/mobile-money/etat/:etat", authAny, findByEtat); 
router.post("/mobile-money/transaction/:id", authAny, transaction); 

module.exports = router;