import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log('DEBUG: Auth Header:', authHeader);
  
  const token = authHeader && authHeader.split(' ')[1];
  console.log('DEBUG: Token:', token ? 'Token trouvé' : 'Token manquant');

  if (!token) return res.status(401).json({ error: 'Accès refusé, token manquant' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('DEBUG: JWT Verification Error:', err.message);
      return res.status(403).json({ error: 'Token invalide' });
    }
    console.log('DEBUG: Token vérifié avec succès pour User ID:', user.id);
    req.user = user;
    next();
  });
};
