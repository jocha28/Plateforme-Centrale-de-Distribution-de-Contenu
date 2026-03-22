const express = require('express');
const { query, param, validationResult } = require('express-validator');
const { obtenirDB } = require('../db/database');
const { verifierToken, verifierAdmin } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES_VALIDES = ['portrait', 'paysage', 'art_numerique', 'abstrait', 'autre'];

/**
 * Transformer une ligne BDD en objet API propre
 */
function serialiserOeuvre(o) {
  const baseUrl = process.env.FASTAPI_URL || 'http://localhost:8000';
  return {
    id: o.id,
    titre: o.titre,
    categorie: o.categorie,
    description: o.description,
    media: {
      original: o.fichier
        ? `${baseUrl}/media/image/${o.fichier}`
        : null,
      miniature: o.miniature
        ? `${baseUrl}/media/image/${o.miniature}`
        : null
    },
    dimensions: {
      largeur: o.largeur_px,
      hauteur: o.hauteur_px,
      ratio: o.largeur_px && o.hauteur_px
        ? (o.largeur_px / o.hauteur_px).toFixed(2)
        : null
    },
    exif: {
      appareil: o.appareil,
      lieu: o.lieu,
      datePrise: o.date_prise
    },
    tags: o.tags ? o.tags.split(',') : [],
    statistiques: {
      vues: o.vues,
      likes: o.likes
    },
    creeLe: o.cree_le,
    modifieLe: o.modifie_le
  };
}

// ─── Lecture publique ────────────────────────────────────────────────────────

/**
 * GET /api/v1/gallery
 * Toutes les œuvres visuelles, toutes catégories confondues.
 */
router.get(
  '/',
  [
    query('tri').optional().isIn(['date', 'vues', 'likes', 'titre']),
    query('ordre').optional().isIn(['asc', 'desc']),
    query('page').optional().isInt({ min: 1 }),
    query('limite').optional().isInt({ min: 1, max: 100 })
  ],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const { tri = 'date', ordre = 'desc' } = req.query;
    const page   = parseInt(req.query.page   || '1', 10);
    const limite = parseInt(req.query.limite || '20', 10);
    const offset = (page - 1) * limite;

    const colonnesTri = { date: 'cree_le', vues: 'vues', likes: 'likes', titre: 'titre' };
    const colonneTri = colonnesTri[tri] || 'cree_le';
    const direction  = ordre === 'asc' ? 'ASC' : 'DESC';

    try {
      const db = obtenirDB();
      const total = db.prepare('SELECT COUNT(*) as total FROM oeuvres_visuelles').get().total;
      const oeuvres = db.prepare(
        `SELECT * FROM oeuvres_visuelles ORDER BY ${colonneTri} ${direction} LIMIT ? OFFSET ?`
      ).all(limite, offset);

      // Regrouper par catégorie dans le résumé
      const parCategorie = db.prepare(
        'SELECT categorie, COUNT(*) as nb FROM oeuvres_visuelles GROUP BY categorie'
      ).all();

      return res.json({
        succes: true,
        resume: { total, parCategorie },
        donnees: oeuvres.map(serialiserOeuvre),
        pagination: {
          total,
          page,
          limite,
          totalPages: Math.ceil(total / limite),
          suivante: page * limite < total ? page + 1 : null,
          precedente: page > 1 ? page - 1 : null
        }
      });
    } catch (err) {
      console.error('[Gallery] GET / :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * GET /api/v1/gallery/portraits
 * Série photographique portraits uniquement.
 * (Route nommée avant /:categorie pour éviter le conflit de routage)
 */
router.get('/portraits', (req, res) => {
  const page   = parseInt(req.query.page   || '1', 10);
  const limite = parseInt(req.query.limite || '20', 10);
  const offset = (page - 1) * limite;

  try {
    const db = obtenirDB();
    const total = db.prepare(
      "SELECT COUNT(*) as total FROM oeuvres_visuelles WHERE categorie = 'portrait'"
    ).get().total;

    const portraits = db.prepare(
      "SELECT * FROM oeuvres_visuelles WHERE categorie = 'portrait' ORDER BY cree_le DESC LIMIT ? OFFSET ?"
    ).all(limite, offset);

    return res.json({
      succes: true,
      categorie: 'portrait',
      donnees: portraits.map(serialiserOeuvre),
      pagination: {
        total,
        page,
        limite,
        totalPages: Math.ceil(total / limite),
        suivante: page * limite < total ? page + 1 : null,
        precedente: page > 1 ? page - 1 : null
      }
    });
  } catch (err) {
    console.error('[Gallery] GET /portraits :', err.message);
    return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
  }
});

/**
 * GET /api/v1/gallery/:categorie
 * Filtrer par catégorie : portrait | paysage | art_numerique | abstrait | autre
 */
router.get(
  '/:categorie',
  [
    param('categorie')
      .isIn(CATEGORIES_VALIDES)
      .withMessage(`Catégorie invalide. Valeurs acceptées : ${CATEGORIES_VALIDES.join(', ')}`)
  ],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const { categorie } = req.params;
    const page   = parseInt(req.query.page   || '1', 10);
    const limite = parseInt(req.query.limite || '20', 10);
    const offset = (page - 1) * limite;

    try {
      const db = obtenirDB();
      const total = db.prepare(
        'SELECT COUNT(*) as total FROM oeuvres_visuelles WHERE categorie = ?'
      ).get(categorie).total;

      const oeuvres = db.prepare(
        'SELECT * FROM oeuvres_visuelles WHERE categorie = ? ORDER BY cree_le DESC LIMIT ? OFFSET ?'
      ).all(categorie, limite, offset);

      return res.json({
        succes: true,
        categorie,
        donnees: oeuvres.map(serialiserOeuvre),
        pagination: {
          total,
          page,
          limite,
          totalPages: Math.ceil(total / limite),
          suivante: page * limite < total ? page + 1 : null,
          precedente: page > 1 ? page - 1 : null
        }
      });
    } catch (err) {
      console.error('[Gallery] GET /:categorie :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * GET /api/v1/gallery/oeuvre/:id
 * Détail d'une œuvre visuelle spécifique.
 */
router.get(
  '/oeuvre/:id',
  [param('id').isInt({ min: 1 })],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    try {
      const db = obtenirDB();
      const oeuvre = db.prepare('SELECT * FROM oeuvres_visuelles WHERE id = ?').get(req.params.id);

      if (!oeuvre) {
        return res.status(404).json({ succes: false, message: 'Œuvre introuvable.' });
      }

      db.prepare('UPDATE oeuvres_visuelles SET vues = vues + 1 WHERE id = ?').run(req.params.id);
      oeuvre.vues += 1;

      return res.json({ succes: true, donnees: serialiserOeuvre(oeuvre) });
    } catch (err) {
      console.error('[Gallery] GET /oeuvre/:id :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

// ─── Écriture protégée ───────────────────────────────────────────────────────

/**
 * DELETE /api/v1/gallery/:id
 * Supprimer une œuvre visuelle (admin uniquement).
 */
router.delete(
  '/:id',
  verifierToken,
  verifierAdmin,
  [param('id').isInt({ min: 1 })],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    try {
      const db = obtenirDB();
      const resultat = db.prepare('DELETE FROM oeuvres_visuelles WHERE id = ?').run(req.params.id);

      if (resultat.changes === 0) {
        return res.status(404).json({ succes: false, message: 'Œuvre introuvable.' });
      }

      return res.json({ succes: true, message: 'Œuvre supprimée avec succès.' });
    } catch (err) {
      console.error('[Gallery] DELETE /:id :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

module.exports = router;
