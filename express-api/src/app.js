require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const routesAuth    = require('./routes/auth');
const routesTracks  = require('./routes/tracks');
const routesGallery = require('./routes/gallery');
const routesContent = require('./routes/content');
const { obtenirDB } = require('./db/database');
const { obtenirStatsYoutube, obtenirStatsAgregeees } = require('./services/socialStats');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Sécurité ─────────────────────────────────────────────────────────────────
app.use(helmet());

// CORS — restreindre aux origines autorisées
const originesAutorisees = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (ex: Postman, CLI)
    if (!origin || originesAutorisees.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origine non autorisée par CORS : ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiteurGlobal = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { succes: false, message: 'Trop de requêtes — réessayez dans 15 minutes.' }
});

const limiteurAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { succes: false, message: 'Trop de tentatives de connexion — réessayez dans 15 minutes.' }
});

app.use(limiteurGlobal);

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logs ──────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Fichiers statiques (miniatures, previews) ─────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Route de santé ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    statut: 'ok',
    service: 'Plateforme Contenu — Express API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// ── Routes API ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',    limiteurAuth, routesAuth);
app.use('/api/v1/tracks',  routesTracks);
app.use('/api/v1/gallery', routesGallery);
app.use('/api/v1/content', routesContent);
app.use('/api/v1/stats',   routesContent); // GET /api/v1/stats est dans content.js

// ── Endpoint social stats (consommation API tierce) ───────────────────────────

/**
 * GET /api/v1/social/stats?youtubeId=XXX&soundcloudUrl=XXX
 * Agréger les statistiques depuis YouTube et/ou SoundCloud.
 */
app.get('/api/v1/social/stats', async (req, res) => {
  const { youtubeId, soundcloudUrl } = req.query;

  if (!youtubeId && !soundcloudUrl) {
    return res.status(400).json({
      succes: false,
      message: 'Paramètre manquant : youtubeId et/ou soundcloudUrl requis.',
      exemple: '/api/v1/social/stats?youtubeId=dQw4w9WgXcQ'
    });
  }

  try {
    const stats = await obtenirStatsAgregeees({ youtubeId, soundcloudUrl });
    return res.json({ succes: true, donnees: stats });
  } catch (err) {
    return res.status(500).json({ succes: false, message: err.message });
  }
});

// ── Documentation des routes (index de l'API) ─────────────────────────────────
app.get('/api/v1', (req, res) => {
  res.json({
    nom: 'Plateforme Centrale de Distribution de Contenu',
    version: 'v1',
    description: 'API REST pour morceaux de musique, photographies et art numérique.',
    routes: {
      publiques: {
        'GET /api/v1/tracks':                    'Liste des morceaux (filtres: type, genre, tri)',
        'GET /api/v1/tracks/:id':                'Détail d\'un morceau',
        'GET /api/v1/gallery':                   'Toutes les œuvres visuelles',
        'GET /api/v1/gallery/portraits':         'Série photographique portraits',
        'GET /api/v1/gallery/:categorie':        'Galerie par catégorie',
        'GET /api/v1/gallery/oeuvre/:id':        'Détail d\'une œuvre',
        'GET /api/v1/content/stats':             'Statistiques globales de la plateforme',
        'GET /api/v1/social/stats':              'Stats YouTube / SoundCloud (API tierces)',
        'GET /health':                           'Santé du service'
      },
      proteges: {
        'POST /api/v1/auth/login':               'Connexion admin → JWT',
        'GET  /api/v1/auth/moi':                 'Infos de l\'utilisateur connecté',
        'POST /api/v1/tracks':                   'Ajouter un morceau [JWT]',
        'PUT  /api/v1/tracks/:id':               'Modifier un morceau [JWT]',
        'DELETE /api/v1/tracks/:id':             'Supprimer un morceau [JWT]',
        'POST /api/v1/content':                  'Ajouter tout type d\'œuvre avec upload [JWT]',
        'PUT  /api/v1/content/:type/:id':        'Modifier une œuvre [JWT]',
        'DELETE /api/v1/content/:type/:id':      'Supprimer une œuvre [JWT]',
        'DELETE /api/v1/gallery/:id':            'Supprimer une œuvre visuelle [JWT]'
      }
    },
    fastapi: {
      url: process.env.FASTAPI_URL || 'http://localhost:8000',
      docs: `${process.env.FASTAPI_URL || 'http://localhost:8000'}/docs`
    }
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    succes: false,
    message: `Route introuvable : ${req.method} ${req.originalUrl}`,
    aide: 'Consulter GET /api/v1 pour la liste des endpoints disponibles.'
  });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Erreur]', err.message);

  if (err.message.startsWith('Origine non autorisée par CORS')) {
    return res.status(403).json({ succes: false, message: err.message });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      succes: false,
      message: `Fichier trop volumineux. Limite : ${process.env.MAX_UPLOAD_SIZE_MB || 50} Mo.`
    });
  }

  res.status(500).json({
    succes: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Erreur interne du serveur.'
      : err.message
  });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  // Initialiser la base de données au démarrage
  obtenirDB();

  app.listen(PORT, () => {
    console.log(`\n🚀 Express API démarrée sur http://localhost:${PORT}`);
    console.log(`📖 Documentation : http://localhost:${PORT}/api/v1`);
    console.log(`❤️  Santé        : http://localhost:${PORT}/health\n`);
  });
}

module.exports = app;
