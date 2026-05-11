const express = require("express");
const { updateUser } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const router = express.Router();

router.put("/:userId", protect, updateUser);

module.exports = router;
