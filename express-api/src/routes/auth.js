const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { obtenirDB } = require('../db/database');

const router = express.Router();

/**
 * POST /api/v1/auth/login
 * Connexion administrateur — retourne un JWT.
 *
 * Body : { "username": "admin", "password": "..." }
 */
router.post(
  '/login',
  [
    body('username')
      .trim()
      .notEmpty().withMessage('Le nom d\'utilisateur est requis.')
      .isLength({ max: 50 }).withMessage('Nom d\'utilisateur trop long.'),
    body('password')
      .notEmpty().withMessage('Le mot de passe est requis.')
      .isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères.')
  ],
  async (req, res) => {
    // Valider les champs
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({
        succes: false,
        message: 'Données invalides.',
        erreurs: erreurs.array().map(e => e.msg)
      });
    }

    const { username, password } = req.body;

    try {
      const db = obtenirDB();
      const admin = db.prepare(
        'SELECT * FROM administrateurs WHERE username = ?'
      ).get(username);

      if (!admin) {
        // Message volontairement générique pour éviter l'énumération d'utilisateurs
        return res.status(401).json({
          succes: false,
          message: 'Identifiants incorrects.'
        });
      }

      const motDePasseValide = await bcrypt.compare(password, admin.password);
      if (!motDePasseValide) {
        return res.status(401).json({
          succes: false,
          message: 'Identifiants incorrects.'
        });
      }

      const token = jwt.sign(
        {
          id: admin.id,
          username: admin.username,
          role: 'admin'
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return res.status(200).json({
        succes: true,
        message: 'Connexion réussie.',
        token,
        expireEn: process.env.JWT_EXPIRES_IN || '7d',
        utilisateur: {
          id: admin.id,
          username: admin.username,
          role: 'admin'
        }
      });
    } catch (err) {
      console.error('[Auth] Erreur login :', err.message);
      return res.status(500).json({
        succes: false,
        message: 'Erreur interne du serveur.'
      });
    }
  }
);

/**
 * GET /api/v1/auth/moi
 * Vérifier la validité du token et obtenir les infos de l'utilisateur connecté.
 */
router.get('/moi', (req, res) => {
  const entete = req.headers['authorization'];
  if (!entete || !entete.startsWith('Bearer ')) {
    return res.status(401).json({ succes: false, message: 'Token manquant.' });
  }

  try {
    const payload = jwt.verify(entete.split(' ')[1], process.env.JWT_SECRET);
    return res.json({
      succes: true,
      utilisateur: {
        id: payload.id,
        username: payload.username,
        role: payload.role
      }
    });
  } catch {
    return res.status(401).json({ succes: false, message: 'Token invalide ou expiré.' });
  }
});

module.exports = router;
