const jwt = require('jsonwebtoken');
const UserAdmin = require('../model/UserAdmin');
const User = require('../model/User');
const asyncHandler = require("express-async-handler");

// Middleware pour authentifier uniquement les admins
const adminProtect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await UserAdmin.findByPk(decoded.id, {
                attributes: { exclude: ['password'] }
            });

            if (req.user) {
                req.user.isAdmin = true;
                return next();
            }
        } catch (err) {
            console.error("Admin Auth Error:", err.message);
            return res.status(401).json({ message: "Non autorisé, échec du token admin" });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Non autorisé, pas de token" });
    }

    return res.status(401).json({ message: "Accès refusé, vous n'êtes pas administrateur" });
});

// Middleware pour authentifier soit un utilisateur, soit un admin
const authAny = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = Number(decoded.id);

            // 1. Chercher d'abord dans User (Logique identique à protect)
            let user = await User.findOne({
                where: { id: userId },
                attributes: { exclude: ['password'] }
            });

            if (user) {
                req.user = user;
                // S'assurer que isAdmin est défini (soit via le modèle, soit par défaut)
                if (req.user.isAdmin === undefined) {
                    req.user.isAdmin = false;
                }
                return next();
            }

            // 2. Chercher ensuite dans UserAdmin (Admin)
            let adminUser = await UserAdmin.findOne({
                where: { id: userId },
                attributes: { exclude: ['password'] }
            });

            if (adminUser) {
                req.user = adminUser;
                req.user.isAdmin = true;
                return next();
            }

            console.warn(`[AuthAny] ID ${userId} non trouvé dans les deux tables`);
            return res.status(401).json({ message: "Utilisateur non trouvé" });

        } catch (err) {
            console.error("[AuthAny] Erreur token:", err.message);
            return res.status(401).json({ message: "Non autorisé, token invalide" });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Non autorisé, pas de token" });
    }
});

module.exports = { adminProtect, authAny };
