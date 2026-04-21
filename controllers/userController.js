import User from '../models/User.js';

export const getUserProfile = async (req, res) => {
  try {
    // Supposons que l'ID utilisateur est extrait du token JWT via un middleware
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['username', 'chips']
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
