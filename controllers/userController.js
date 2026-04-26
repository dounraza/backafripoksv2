import User from '../models/User.js';
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: './public/avatars/',
  filename: (req, file, cb) => {
    cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Format d\'image non supporté'));
  }
}).single('avatar');

export const uploadAvatar = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    try {
      const userId = req.user.id;
      const avatarUrl = `/avatars/${req.file.filename}`;
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

      user.avatar_url = avatarUrl;
      await user.save();
      res.json({ avatarUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      name, 
      mobile_money_provider, 
      mobile_money_number, 
      mobile_money_account_name 
    } = req.body || {}; 
    
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    if (name) user.name = name;
    if (mobile_money_provider !== undefined) user.mobile_money_provider = mobile_money_provider;
    if (mobile_money_number !== undefined) user.mobile_money_number = mobile_money_number;
    if (mobile_money_account_name !== undefined) user.mobile_money_account_name = mobile_money_account_name;

    // Si un fichier a été uploadé via multer
    if (req.file) {
      user.avatar_url = `/avatars/${req.file.filename}`;
    }

    await user.save();

    res.json({ 
      message: 'Profil mis à jour avec succès', 
      user: { 
        name: user.name, 
        chips: user.chips, 
        avatar_url: user.avatar_url,
        mobile_money_provider: user.mobile_money_provider,
        mobile_money_number: user.mobile_money_number,
        mobile_money_account_name: user.mobile_money_account_name
      } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    // Supposons que l'ID utilisateur est extrait du token JWT via un middleware
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['name', 'chips', 'avatar_url', 'mobile_money_provider', 'mobile_money_number', 'mobile_money_account_name']
    });

    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateChips = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;
    
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    user.chips = parseFloat(user.chips) + parseFloat(amount);
    await user.save();

    res.json({ chips: user.chips });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
