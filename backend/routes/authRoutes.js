const express = require("express");
const { authUser, register, findByName, updateUser } = require("../controllers/userController");
const upload = require("../middleware/uploadMiddleware");
const router = express.Router();

router.post("/login", authUser); 
router.post("/register", register); 
router.post("/find-by-name", findByName);
router.put("/users/:id", upload.single("avatar"), updateUser);

module.exports = router;
