const jwt = require('jsonwebtoken');
const User = require('../model/User');
const asyncHandler = require("express-async-handler");

const protect = asyncHandler(async (req, res, next) => {
    
    let token;
    console.log("🔍 Incoming Request Headers Authorization:", req.headers.authorization);

    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findOne({
                where: { id: decoded.id },
                attributes: { exclude: ['password'] }
              });
            return next();
        } catch(err) {
            console.log("Auth Middleware Error:", err);
            res.status(401);
            throw new Error("Not autorized, token failed");
        }
    }

    if(!token) {
        console.log("No Token found in Authorization header");
        res.status(401);
        throw new Error("Not autorized");
    }
});

module.exports = protect;