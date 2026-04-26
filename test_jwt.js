import 'dotenv/config';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;
console.log("Secret chargé :", secret);

// Tentative de créer un token
const token = jwt.sign({ id: 1 }, secret, { expiresIn: '1d' });
console.log("Token généré :", token);

// Tentative de vérifier ce même token
try {
  const decoded = jwt.verify(token, secret);
  console.log("Vérification réussie ! Utilisateur :", decoded);
} catch (err) {
  console.error("Vérification échouée :", err.message);
}
