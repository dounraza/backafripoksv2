import RetraitMobileMoney from '../models/RetraitMobileMoney.js';
import User from '../models/User.js';
import Solde from '../models/Solde.js';
import sequelize from '../config/database.js';

export const createRetrait = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { montant, numero, nom } = req.body;
    const pseudo = (req.user && req.user.name) ? req.user.name : req.body.pseudo;

    if (!pseudo) {
      await t.rollback();
      return res.status(400).json({ error: "Pseudo manquant" });
    }

    const user = await User.findOne({ 
      where: { name: pseudo },
      transaction: t
    });
    
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const solde = await Solde.findOne({ 
      where: { userId: user.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    
    if (!solde || parseFloat(solde.montant) < parseFloat(montant)) {
      await t.rollback();
      return res.status(400).json({ error: "Solde insuffisant" });
    }

    if (parseFloat(montant) <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "Montant incorrect" });
    }

    // Déduire immédiatement le solde
    solde.montant = parseFloat(solde.montant) - parseFloat(montant);
    await solde.save({ transaction: t });

    const retrait = await RetraitMobileMoney.create({ 
      pseudo, 
      montant: parseFloat(montant), 
      numero, 
      nom, 
      etat: false 
    }, { transaction: t });

    await t.commit();
    res.status(200).json({ message: "Retrait demandé, solde débité !", montant: solde.montant });
  } catch (error) {
    await t.rollback();
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

  const t = await sequelize.transaction();
  try {
    const demande = await RetraitMobileMoney.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!demande) {
      await t.rollback();
      return res.status(404).json({ error: "Demande de retrait introuvable" });
    }

    // Si on refuse le retrait (etat: false) et qu'il était en attente (etat: false)
    // On doit rembourser l'utilisateur
    if (etat === false && demande.etat === false) {
      const user = await User.findOne({ 
        where: { name: demande.pseudo },
        transaction: t
      });
      
      if (user) {
        const solde = await Solde.findOne({ 
          where: { userId: user.id },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        
        if (solde) {
          solde.montant = parseFloat(solde.montant) + parseFloat(demande.montant);
          await solde.save({ transaction: t });
          console.log(`Retrait refusé, remboursement de ${demande.montant} MGA à ${demande.pseudo}`);
        }
      }
    }

    demande.etat = etat;
    await demande.save({ transaction: t });

    await t.commit();
    res.json({ message: "Mise à jour réussie", demande });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};
