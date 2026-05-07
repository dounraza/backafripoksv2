import Solde from '../models/Solde.js';

export const getSolde = async (req, res) => {
  try {
    const userId = req.user.id; // Sécurisé par le middleware
    const solde = await Solde.findOne({ where: { userId } });
    
    if (!solde) {
        // Créer un solde par défaut si inexistant
        const newSolde = await Solde.create({ userId, montant: 1000.00 });
        return res.json({ montant: newSolde.montant });
    }
    
    res.json({ montant: solde.montant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deposit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Montant invalide" });
    }

    const solde = await Solde.findOne({ where: { userId } });
    if (!solde) {
      const newSolde = await Solde.create({ userId, montant: parseFloat(amount) });
      return res.json({ montant: newSolde.montant });
    }

    solde.montant = parseFloat(solde.montant) + parseFloat(amount);
    await solde.save();
    
    res.json({ montant: solde.montant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const withdraw = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, phone, mobileName } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Montant invalide" });
    }

    const solde = await Solde.findOne({ where: { userId } });
    if (!solde || parseFloat(solde.montant) < parseFloat(amount)) {
      return res.status(400).json({ error: "Solde insuffisant" });
    }

    solde.montant = parseFloat(solde.montant) - parseFloat(amount);
    await solde.save();
    
    console.log(`Demande de retrait: User ${userId}, Montant ${amount}, Tel ${phone}, Nom ${mobileName}`);

    res.json({ montant: solde.montant, message: "Demande de retrait enregistrée" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
