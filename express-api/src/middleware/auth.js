const jwt = require('jsonwebtoken');

/**
 * Middleware de vérification JWT.
 * Protège les routes POST, PUT et DELETE — seul l'admin peut modifier le contenu.
 *
 * Usage : router.post('/route', verifierToken, handler)
 *
 * Le client doit envoyer le header :
 *   Authorization: Bearer <token>
 */
function verifierToken(req, res, next) {
  const entete = req.headers['authorization'];

  if (!entete || !entete.startsWith('Bearer ')) {
    return res.status(401).json({
      succes: false,
      message: 'Accès refusé — Token JWT manquant ou mal formaté.',
      aide: 'Ajouter le header : Authorization: Bearer <votre_token>'
    });
  }

  const token = entete.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.utilisateur = payload;
    next();
  } catch (erreur) {
    if (erreur.name === 'TokenExpiredError') {
      return res.status(401).json({
        succes: false,
        message: 'Token expiré — veuillez vous reconnecter.',
        expireA: erreur.expiredAt
      });
    }

    return res.status(403).json({
      succes: false,
      message: 'Token invalide ou falsifié.'
    });
  }
}

/**
 * Middleware de vérification du rôle administrateur.
 * À utiliser après verifierToken.
 */
function verifierAdmin(req, res, next) {
  if (!req.utilisateur || req.utilisateur.role !== 'admin') {
    return res.status(403).json({
      succes: false,
      message: 'Accès refusé — Droits administrateur requis.'
    });
  }
  next();
}

module.exports = { verifierToken, verifierAdmin };
