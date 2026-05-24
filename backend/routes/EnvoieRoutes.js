const express = require("express");
const { insertEnvoie, getEnvoie, updateCompte, fndAll, remove } = require("../controllers/EnvoieController");
const { authAny } = require("../middleware/adminAuthMiddleware");
const router = express.Router();

// Route publique pour récupérer les comptes actifs
router.get("/compte", getEnvoie); 

// Routes protégées
router.post("/compte", authAny, insertEnvoie); 
router.get("/compte/All", authAny, fndAll); 
router.delete('/compte/remove/:id', authAny, remove);
router.put("/compte/:id", authAny, updateCompte); 

module.exports = router;