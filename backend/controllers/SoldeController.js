const Soldes = require("../model/Soldes");
const User = require("../model/User");
const asyncHandler = require("express-async-handler");
const sequelize = require("../config/Db");

exports.insertSolde = asyncHandler(async (req, res)=> {
    try {
        const {montant, userId} = req.body;
        
        const user = await User.findByPk(userId);

        if(user) {
            const solde = await Soldes.create({montant,userId});
            if(solde){
                res.json("insertion effectuer");   
            }else{
                res.status(401).json('Insertion echouer !');
            }
          
        } else {
            res.status(401).json('Utilisateur non trouver !');
        }
    } catch (error) {
        console.error('[INSERT SOLDE] ERR', error);
    }
});

exports.getSolde = asyncHandler(async (req, res)=> {
    const userId = req.params.id;
    
    const solde = await Soldes.findOne({ where: { userId }});

    if(solde) {
          res.json({
            solde : solde.montant
          });
    } else {
        res.status(401).json('Solde Utilisateur non trouver !');
    }
});

exports.allSolde = asyncHandler(async (req, res) => {
  const query = `
    SELECT s.id, s.userId, s.montant, u.name AS pseudo, s.updatedAt AS dernier
    FROM solde s
    INNER JOIN users u ON u.id = s.userId
  `;

  const [results] = await sequelize.query(query);

  res.json(results);
});
exports.totalSoldes = asyncHandler(async (req, res) => {
    try {
        const query = `SELECT SUM(montant) AS total FROM solde`;
        const [ results ] = await sequelize.query(query);
    
        res.json(results[0].total);
    } catch (error) {
        console.error(error);
        res.send('Internal Server Error');
    }
});

exports.updateSolde = asyncHandler(async (req, res) => {
  try {  
      const userId = req.params.id;
      let { newSolde } = req.body;
      
      // Conversion sécurisée et validation
     newSolde = Number(newSolde);
      if (isNaN(newSolde)) {
          return res.status(400).json({ message: "Le montant doit être un nombre valide." });
      }

      const solde = await Soldes.findOne({ where: { userId } });

      if (!solde) {
          return res.status(404).json({ message: "Solde utilisateur non trouvé." });
      }

      const lastSolde = solde.montant;
      
      let updatedSolde = Number(lastSolde) + newSolde;
      
      // Addition du montant
      solde.montant = updatedSolde;

      // Sauvegarde dans la BDD
      await solde.save();

      res.status(200).json({ message: "Solde mis à jour avec succès.", nouveauSolde: solde.montant });
  } catch (error) {
      console.error('[UPDATE SOLDE] ERR', error);
  }
});