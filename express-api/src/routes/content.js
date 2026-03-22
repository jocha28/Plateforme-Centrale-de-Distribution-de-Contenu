const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');
const axios = require('axios');
const { obtenirDB } = require('../db/database');
const { verifierToken, verifierAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Configuration Multer (stockage temporaire avant transfert FastAPI) ────────
const stockage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/temp'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const filtresFichiers = (req, file, cb) => {
  const typesAudio  = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'];
  const typesImage  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'];
  const typesVideoA = ['video/mp4', 'video/quicktime'];

  if ([...typesAudio, ...typesImage, ...typesVideoA].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté : ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage: stockage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50')) * 1024 * 1024 },
  fileFilter: filtresFichiers
});

// ─── Route principale : POST /api/v1/content ────────────────────────────────

/**
 * POST /api/v1/content
 * Ajouter une nouvelle œuvre (morceau OU visuelle) avec upload facultatif.
 * Protégé JWT — admin uniquement.
 *
 * Body (multipart/form-data) :
 *   type_contenu : "morceau" | "instrumentale" | "portrait" | "paysage" | "art_numerique" | "abstrait" | "autre"
 *   titre        : string (requis)
 *   description  : string
 *   + champs spécifiques selon le type
 *   fichier      : File (optionnel)
 */
router.post(
  '/',
  verifierToken,
  verifierAdmin,
  upload.single('fichier'),
  [
    body('type_contenu')
      .notEmpty()
      .isIn(['morceau', 'instrumentale', 'portrait', 'paysage', 'art_numerique', 'abstrait', 'autre'])
      .withMessage('type_contenu invalide.'),
    body('titre').trim().notEmpty().withMessage('Le titre est requis.').isLength({ max: 200 })
  ],
  async (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const { type_contenu, titre, description, ...autresChamps } = req.body;
    const typeAudio = ['morceau', 'instrumentale'];
    const typeVisuel = ['portrait', 'paysage', 'art_numerique', 'abstrait', 'autre'];

    let identifiantFichier = null;

    // Si un fichier a été uploadé, le transférer au service FastAPI
    if (req.file) {
      try {
        const FormData = require('form_data') || (() => {
          // Fallback natif si form-data n'est pas installé
          throw new Error('module form-data manquant');
        })();
        // Dans un vrai déploiement, on utiliserait FormData pour envoyer vers FastAPI.
        // Ici on conserve le nom UUID comme identifiant du fichier.
        identifiantFichier = req.file.filename;
      } catch {
        // Conserver l'identifiant local si FastAPI n'est pas disponible
        identifiantFichier = req.file.filename;
      }
    }

    try {
      const db = obtenirDB();
      let idInseree;

      if (typeAudio.includes(type_contenu)) {
        const resultat = db.prepare(`
          INSERT INTO morceaux (titre, artiste, album, genre, duree_secondes, date_sortie, description, fichier_audio, type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          titre,
          autresChamps.artiste || 'Jocha',
          autresChamps.album || null,
          autresChamps.genre || null,
          autresChamps.duree_secondes ? parseInt(autresChamps.duree_secondes) : null,
          autresChamps.date_sortie || null,
          description || null,
          identifiantFichier,
          type_contenu
        );
        idInseree = resultat.lastInsertRowid;

        const nouveau = db.prepare('SELECT * FROM morceaux WHERE id = ?').get(idInseree);
        return res.status(201).json({
          succes: true,
          message: `${type_contenu === 'morceau' ? 'Morceau' : 'Instrumentale'} ajouté(e) avec succès.`,
          type: 'audio',
          donnees: nouveau
        });

      } else if (typeVisuel.includes(type_contenu)) {
        const resultat = db.prepare(`
          INSERT INTO oeuvres_visuelles (titre, categorie, description, fichier, appareil, lieu, date_prise, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          titre,
          type_contenu,
          description || null,
          identifiantFichier,
          autresChamps.appareil || null,
          autresChamps.lieu || null,
          autresChamps.date_prise || null,
          autresChamps.tags || null
        );
        idInseree = resultat.lastInsertRowid;

        const nouveau = db.prepare('SELECT * FROM oeuvres_visuelles WHERE id = ?').get(idInseree);
        return res.status(201).json({
          succes: true,
          message: 'Œuvre visuelle ajoutée avec succès.',
          type: 'visuel',
          donnees: nouveau
        });
      }

    } catch (err) {
      console.error('[Content] POST / :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * PUT /api/v1/content/:type/:id
 * Modifier une œuvre existante. type = "track" | "gallery"
 */
router.put(
  '/:type/:id',
  verifierToken,
  verifierAdmin,
  [
    param('type').isIn(['track', 'gallery']).withMessage('Type invalide : "track" ou "gallery".'),
    param('id').isInt({ min: 1 })
  ],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const table = req.params.type === 'track' ? 'morceaux' : 'oeuvres_visuelles';
    const champsAutorise = req.params.type === 'track'
      ? ['titre', 'artiste', 'album', 'genre', 'duree_secondes', 'date_sortie', 'description']
      : ['titre', 'description', 'appareil', 'lieu', 'date_prise', 'tags'];

    const mises_a_jour = [];
    const valeurs = [];

    champsAutorise.forEach(champ => {
      if (req.body[champ] !== undefined) {
        mises_a_jour.push(`${champ} = ?`);
        valeurs.push(req.body[champ]);
      }
    });

    if (mises_a_jour.length === 0) {
      return res.status(400).json({ succes: false, message: 'Aucun champ modifiable fourni.' });
    }

    mises_a_jour.push("modifie_le = datetime('now')");
    valeurs.push(req.params.id);

    try {
      const db = obtenirDB();
      const resultat = db.prepare(
        `UPDATE ${table} SET ${mises_a_jour.join(', ')} WHERE id = ?`
      ).run(...valeurs);

      if (resultat.changes === 0) {
        return res.status(404).json({ succes: false, message: 'Contenu introuvable.' });
      }

      const modifie = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      return res.json({ succes: true, message: 'Contenu mis à jour.', donnees: modifie });
    } catch (err) {
      console.error('[Content] PUT :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

/**
 * DELETE /api/v1/content/:type/:id
 * Supprimer une œuvre. type = "track" | "gallery"
 */
router.delete(
  '/:type/:id',
  verifierToken,
  verifierAdmin,
  [
    param('type').isIn(['track', 'gallery']),
    param('id').isInt({ min: 1 })
  ],
  (req, res) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({ succes: false, erreurs: erreurs.array().map(e => e.msg) });
    }

    const table = req.params.type === 'track' ? 'morceaux' : 'oeuvres_visuelles';

    try {
      const db = obtenirDB();
      const resultat = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);

      if (resultat.changes === 0) {
        return res.status(404).json({ succes: false, message: 'Contenu introuvable.' });
      }

      return res.json({ succes: true, message: 'Contenu supprimé avec succès.' });
    } catch (err) {
      console.error('[Content] DELETE :', err.message);
      return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
    }
  }
);

// ─── Statistiques globales (publique) ────────────────────────────────────────

/**
 * GET /api/v1/stats
 * Statistiques globales de la plateforme.
 */
router.get('/stats', async (req, res) => {
  try {
    const db = obtenirDB();

    const statsMorceaux = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(vues) as totalVues,
        SUM(likes) as totalLikes,
        COUNT(CASE WHEN type = 'morceau' THEN 1 END) as nbMorceaux,
        COUNT(CASE WHEN type = 'instrumentale' THEN 1 END) as nbInstrumentales
      FROM morceaux
    `).get();

    const statsVisuelles = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(vues) as totalVues,
        SUM(likes) as totalLikes
      FROM oeuvres_visuelles
    `).get();

    const topMorceaux = db.prepare(
      'SELECT id, titre, type, vues, likes FROM morceaux ORDER BY vues DESC LIMIT 3'
    ).all();

    const topVisuelles = db.prepare(
      'SELECT id, titre, categorie, vues, likes FROM oeuvres_visuelles ORDER BY vues DESC LIMIT 3'
    ).all();

    return res.json({
      succes: true,
      donnees: {
        musique: {
          total: statsMorceaux.total,
          morceaux: statsMorceaux.nbMorceaux,
          instrumentales: statsMorceaux.nbInstrumentales,
          vues: statsMorceaux.totalVues || 0,
          likes: statsMorceaux.totalLikes || 0
        },
        visuels: {
          total: statsVisuelles.total,
          vues: statsVisuelles.totalVues || 0,
          likes: statsVisuelles.totalLikes || 0
        },
        global: {
          totalOeuvres: (statsMorceaux.total || 0) + (statsVisuelles.total || 0),
          totalVues: (statsMorceaux.totalVues || 0) + (statsVisuelles.totalVues || 0),
          totalLikes: (statsMorceaux.totalLikes || 0) + (statsVisuelles.totalLikes || 0)
        },
        topMorceaux,
        topVisuelles
      }
    });
  } catch (err) {
    console.error('[Stats] GET :', err.message);
    return res.status(500).json({ succes: false, message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;
