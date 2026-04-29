import DepotMobileMoney from '../models/DepotMobileMoney.js';
import User from '../models/User.js';
import Solde from '../models/Solde.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';

export const createDepot = async (req, res) => {
  try {
    const { montant, numero, nom, reference } = req.body;
    // Utiliser req.user.name si authentifié, sinon req.body.pseudo (pour compatibilité)
    const pseudo = (req.user && req.user.name) ? req.user.name : req.body.pseudo;

    if (!pseudo) {
      return res.status(400).json({ error: 'Pseudo manquant' });
    }

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

  const t = await sequelize.transaction();
  try {
    const depot = await DepotMobileMoney.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!depot) {
      await t.rollback();
      return res.status(404).json({ error: "Dépôt introuvable" });
    }

    // Si déjà validé, on évite le double crédit
    if (depot.etat === true && etat === true) {
      await t.rollback();
      return res.status(400).json({ error: "Ce dépôt est déjà validé" });
    }

    const user = await User.findOne({ 
      where: { name: depot.pseudo },
      transaction: t
    });
    
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    let solde = await Solde.findOne({ 
      where: { userId: user.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    
    if (!solde) {
        solde = await Solde.create({ userId: user.id, montant: 0 }, { transaction: t });
    }

    // Si on valide le dépôt (etat: true) et qu'il n'était pas encore validé
    if (etat === true && depot.etat === false) {
      solde.montant = parseFloat(solde.montant) + parseFloat(depot.montant);
      await solde.save({ transaction: t });
      console.log(`Dépôt validé pour ${depot.pseudo}: +${depot.montant} MGA`);
    }

    depot.etat = etat;
    await depot.save({ transaction: t });

    await t.commit();
    res.json({ message: "Mise à jour réussie", depot });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};
