const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { obtenirDB } = require('../db/database');
const { verifierToken, verifierAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Formater la durée en secondes → "mm:ss"
 */
function formaterDuree(secondes) {
  if (!secondes) return null;
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Transformer une ligne de BDD en objet API propre
 */
function serialiserMorceau(m) {
  return {
    id: m.id,
    titre: m.titre,
    artiste: m.artiste,
    album: m.album,
    genre: m.genre,
    duree: {
      secondes: m.duree_secondes,
      formate: formaterDuree(m.duree_secondes)
    },
    dateSortie: m.date_sortie,
    description: m.description,
    type: m.type,
    media: {
      audio: m.fichier_audio
        ? `${process.env.FASTAPI_URL || 'http://localhost:8000'}/media/stream/${m.fichier_audio}`
        : null,
      couverture: m.image_couverture
        ? `${process.env.FASTAPI_URL || 'http://localhost:8000'}/media/image/${m.image_couverture}`
        : null
    },
    statistiques: {
      vues: m.vues,
      likes: m.likes
    },
    creeLe: m.cree_le,
    modifieLe: m.modifie_le
  };
}

// ─── Lecture publique ────────────────────────────────────────────────────────

/**
 * GET /api/v1/tracks
 * Récupérer tous les morceaux avec filtres optionnels.
 *
 * Query params :
 *   - type      : "morceau" | "instrumentale"
 *   - genre     : string (filtre partiel)
 *   - tri       : "date" | "vues" | "likes" | "titre" (défaut: date)
 *   - ordre     : "asc" | "desc" (défaut: desc)
 *   - page      : number (défaut: 1)
 *   - limite    : number (défaut: 20, max: 100)
 */
router.get(
  '/',
  [
    query('type').optional().isIn(['morceau', 'instrumentale']),
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

    const { type, genre, tri = 'date', ordre = 'desc' } = req.query;
    const page   = parseInt(req.query.page   || '1', 10);
    const limite = parseInt(req.query.limite || '20', 10);
    const offset = (page - 1) * limite;

    const colonnesTri = {
      date:  'date_sortie',
      vues:  'vues',
      likes: 'likes',
      titre: 'titre'
    };
    const colonneTri = colonnesTri[tri] || 'date_sortie';
    const directionTri = ordre === 'asc' ? 'ASC' : 'DESC';

    const conditions = [];
    const params = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (genre) {
      conditions.push('genre LIKE ?');
      params.push(`%${genre}%`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const db = obtenirDB();

      const total = db.prepare(
        `SELECT COUNT(*) as total FROM morceaux ${clauseWhere}`
      ).get(...params).total;

      const morceaux = db.prepare(
        `SELECT * FROM morceaux ${clauseWhere}
         ORDER BY ${colonneTri} ${directionTri}
         LIMIT ? OFFSET ?`
      ).all(...params, limite, offset);

      return res.json({
        succes: true,
        donnees: morceaux.map(serialiserMorceau),
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
      console.error('[Tracks] GET / :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * GET /api/v1/tracks/:id
 * Détail d'un morceau + incrément du compteur de vues.
 */
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('ID invalide.')],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    try {
      const db = obtenirDB();
      const morceau = db.prepare('SELECT * FROM morceaux WHERE id = ?').get(req.params.id);

      if (!morceau) {
        return res.status(404).json({ succes: false, message: 'Morceau introuvable.' });
      }

      // Incrémenter les vues
      db.prepare('UPDATE morceaux SET vues = vues + 1 WHERE id = ?').run(req.params.id);
      morceau.vues += 1;

      return res.json({ succes: true, donnees: serialiserMorceau(morceau) });
    } catch (err) {
      console.error('[Tracks] GET /:id :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

// ─── Écriture protégée (Admin JWT requis) ────────────────────────────────────

/**
 * POST /api/v1/tracks
 * Ajouter un nouveau morceau (admin uniquement).
 */
router.post(
  '/',
  verifierToken,
  verifierAdmin,
  [
    body('titre').trim().notEmpty().withMessage('Le titre est requis.').isLength({ max: 200 }),
    body('type').isIn(['morceau', 'instrumentale']).withMessage('Type invalide.'),
    body('duree_secondes').optional().isInt({ min: 1 }),
    body('date_sortie').optional().isISO8601().withMessage('Format de date invalide (YYYY-MM-DD).')
  ],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const { titre, artiste = 'Jocha', album, genre, duree_secondes, date_sortie, description, type } = req.body;

    try {
      const db = obtenirDB();
      const resultat = db.prepare(`
        INSERT INTO morceaux (titre, artiste, album, genre, duree_secondes, date_sortie, description, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(titre, artiste, album || null, genre || null, duree_secondes || null, date_sortie || null, description || null, type);

      const nouveau = db.prepare('SELECT * FROM morceaux WHERE id = ?').get(resultat.lastInsertRowid);
      return res.status(201).json({
        succes: true,
        message: 'Morceau ajouté avec succès.',
        donnees: serialiserMorceau(nouveau)
      });
    } catch (err) {
      console.error('[Tracks] POST / :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * PUT /api/v1/tracks/:id
 * Modifier un morceau existant (admin uniquement).
 */
router.put(
  '/:id',
  verifierToken,
  verifierAdmin,
  [param('id').isInt({ min: 1 })],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const champsModifiables = ['titre', 'artiste', 'album', 'genre', 'duree_secondes', 'date_sortie', 'description', 'type'];
    const mises_a_jour = [];
    const valeurs = [];

    champsModifiables.forEach(champ => {
      if (req.body[champ] !== undefined) {
        mises_a_jour.push(`${champ} = ?`);
        valeurs.push(req.body[champ]);
      }
    });

    if (mises_a_jour.length === 0) {
      return res.status(400).json({ succes: false, message: 'Aucun champ à mettre à jour.' });
    }

    mises_a_jour.push("modifie_le = datetime('now')");
    valeurs.push(req.params.id);

    try {
      const db = obtenirDB();
      const resultat = db.prepare(
        `UPDATE morceaux SET ${mises_a_jour.join(', ')} WHERE id = ?`
      ).run(...valeurs);

      if (resultat.changes === 0) {
        return res.status(404).json({ succes: false, message: 'Morceau introuvable.' });
      }

      const modifie = db.prepare('SELECT * FROM morceaux WHERE id = ?').get(req.params.id);
      return res.json({ succes: true, message: 'Morceau mis à jour.', donnees: serialiserMorceau(modifie) });
    } catch (err) {
      console.error('[Tracks] PUT /:id :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * DELETE /api/v1/tracks/:id
 * Supprimer un morceau (admin uniquement).
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
      const resultat = db.prepare('DELETE FROM morceaux WHERE id = ?').run(req.params.id);

      if (resultat.changes === 0) {
        return res.status(404).json({ succes: false, message: 'Morceau introuvable.' });
      }

      return res.json({ succes: true, message: 'Morceau supprimé avec succès.' });
    } catch (err) {
      console.error('[Tracks] DELETE /:id :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

module.exports = router;
