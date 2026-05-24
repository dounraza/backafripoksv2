const jwt = require('jsonwebtoken');
const User = require('../model/User');
const asyncHandler = require("express-async-handler");

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET manquant!");
        return res.status(500).json({ message: "Configuration serveur invalide" });
    }

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(" ")[1];
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findOne({
                where: { id: Number(decoded.id) },
                attributes: { exclude: ['password'] }
            });

            if (!req.user) {
                console.log("Utilisateur introuvable en DB pour ID:", decoded.id);
                return res.status(401).json({ message: "Utilisateur introuvable" });
            }

            return next();
        } catch (err) {
            console.error("Auth Error:", err.message);
            return res.status(401).json({ message: "Not authorized, token failed" });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token" });
    }
});

module.exports = protect;
