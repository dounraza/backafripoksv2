const jwt = require('jsonwebtoken');
const User = require('../model/User');
const asyncHandler = require("express-async-handler");

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findOne({
                where: { id: decoded.id },
                attributes: { exclude: ['password'] }
            });

            if (!req.user) {
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