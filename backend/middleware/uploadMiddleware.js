const multer = require("multer");
const path = require("path");

// Configure storage for avatars
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Correct path: E:\v2\frontafripoksv2\public\avatars
        // We are in E:\v2\backafripoksv2\backend, so we need to go up two levels to E:\v2, then into frontafripoksv2\public\avatars
        cb(null, path.join(__dirname, "../../../frontafripoksv2/public/avatars"));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error("Only images are allowed (jpeg, jpg, png, gif)"));
        }
    }
});

module.exports = upload;
