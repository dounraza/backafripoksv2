import RetraitMobileMoney from '../models/RetraitMobileMoney.js';
import User from '../models/User.js';
import Solde from '../models/Solde.js';

export const createRetrait = async (req, res) => {
  try {
    const { pseudo, montant, numero, nom } = req.body;

    const user = await User.findOne({ where: { name: pseudo } });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const solde = await Solde.findOne({ where: { userId: user.id } });
    if (!solde || parseFloat(solde.montant) < parseFloat(montant)) {
      return res.status(400).json({ error: "Solde insuffisant" });
    }

    if (parseFloat(montant) <= 0) {
      return res.status(400).json({ error: "Montant incorrect" });
    }

    // Déduire immédiatement le solde
    solde.montant = parseFloat(solde.montant) - parseFloat(montant);
    await solde.save();

    const retrait = await RetraitMobileMoney.create({ 
      pseudo, 
      montant: parseFloat(montant), 
      numero, 
      nom, 
      etat: false 
    });

    if (retrait) {
      res.status(200).json({ message: "Retrait demandé, solde débité !", montant: solde.montant });
    } else {
      // Rollback du solde
      solde.montant = parseFloat(solde.montant) + parseFloat(montant);
      await solde.save();
      res.status(500).json({ error: 'Erreur lors du retrait !' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const findByPseudo = async (req, res) => {
  try {
    const { pseudo } = req.params;
    const retraits = await RetraitMobileMoney.findAll({ where: { pseudo } });
    res.json(retraits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const findAll = async (req, res) => {
  try {
    const retraits = await RetraitMobileMoney.findAll({
      order: [['id', 'DESC']]
    });
    res.json(retraits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const processTransaction = async (req, res) => {
  const { id } = req.params;
  const { etat } = req.body;

  try {
    const demande = await RetraitMobileMoney.findByPk(id);
    if (!demande) return res.status(404).json({ error: "Demande de retrait introuvable" });

    const user = await User.findOne({ where: { name: demande.pseudo } });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const solde = await Solde.findOne({ where: { userId: user.id } });
    if (!solde) return res.status(404).json({ error: "Solde introuvable" });

    // Si on refuse le retrait (etat: false) et qu'il était en attente (etat: false)
    if (etat === false && demande.etat === false) {
      solde.montant = parseFloat(solde.montant) + parseFloat(demande.montant);
      await solde.save();
    }

    demande.etat = etat;
    await demande.save();

    res.json({ message: "Mise à jour réussie", demande });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
