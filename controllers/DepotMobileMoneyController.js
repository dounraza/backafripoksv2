import DepotMobileMoney from '../models/DepotMobileMoney.js';
import User from '../models/User.js';
import Solde from '../models/Solde.js';
import { Op } from 'sequelize';

export const createDepot = async (req, res) => {
  try {
    const { pseudo, montant, numero, nom, reference } = req.body;

    if (!montant || isNaN(montant) || parseFloat(montant) <= 0) {
      return res.status(400).json({ error: 'Montant incorrect' });
    }

    const depot = await DepotMobileMoney.create({ 
      pseudo, 
      montant: parseFloat(montant), 
      numero, 
      nom, 
      reference 
    });

    if (depot) {
      res.status(200).json({ message: "Dépôt effectué !" });
    } else {
      res.status(500).json({ error: 'Erreur lors du dépôt !' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const findByPseudo = async (req, res) => {
  try {
    const { pseudo } = req.params;
    const depots = await DepotMobileMoney.findAll({ where: { pseudo } });
    res.json(depots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const findAll = async (req, res) => {
  try {
    const depots = await DepotMobileMoney.findAll({
      order: [['id', 'DESC']]
    });
    res.json(depots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const processTransaction = async (req, res) => {
  const { id } = req.params;
  const { etat } = req.body;

  try {
    const depot = await DepotMobileMoney.findByPk(id);
    if (!depot) return res.status(404).json({ error: "Dépôt introuvable" });

    // Si déjà validé, on ne peut plus changer ? (selon la logique métier, ici on laisse faire comme dans la réf)
    const user = await User.findOne({ where: { name: depot.pseudo } });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    let solde = await Solde.findOne({ where: { userId: user.id } });
    if (!solde) {
        solde = await Solde.create({ userId: user.id, montant: 0 });
    }

    // Si on valide le dépôt (etat: true)
    if (etat === true && depot.etat === false) {
      solde.montant = parseFloat(solde.montant) + parseFloat(depot.montant);
      await solde.save();
    }

    depot.etat = etat;
    await depot.save();

    res.json({ message: "Mise à jour réussie", depot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
