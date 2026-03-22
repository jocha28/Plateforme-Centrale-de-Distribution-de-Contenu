/**
 * Script de seed — Peuple la base de données avec des données de démonstration.
 * Usage : node src/db/seed.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { obtenirDB, fermerDB } = require('./database');

async function peupler() {
  const db = obtenirDB();

  console.log('\n🎵 Démarrage du peuplement de la base de données...\n');

  // ── Administrateur ──────────────────────────────────────────────────────────
  const motDePasseHash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || 'admin123',
    12
  );

  const insertAdmin = db.prepare(`
    INSERT OR IGNORE INTO administrateurs (username, password)
    VALUES (?, ?)
  `);
  insertAdmin.run(process.env.ADMIN_USERNAME || 'admin', motDePasseHash);
  console.log('✓ Compte administrateur créé');

  // ── Morceaux de musique ─────────────────────────────────────────────────────
  const insertMorceau = db.prepare(`
    INSERT OR IGNORE INTO morceaux
      (titre, artiste, album, genre, duree_secondes, date_sortie, description, type, vues, likes)
    VALUES
      (@titre, @artiste, @album, @genre, @duree_secondes, @date_sortie, @description, @type, @vues, @likes)
  `);

  const morceaux = [
    {
      titre: 'Lumière de Minuit',
      artiste: 'Jocha',
      album: 'Fragments',
      genre: 'R&B / Soul',
      duree_secondes: 214,
      date_sortie: '2024-03-15',
      description: 'Un voyage introspectif entre ombres et lumières, porté par une production minimaliste.',
      type: 'morceau',
      vues: 1842,
      likes: 97
    },
    {
      titre: 'Béton Fleuri',
      artiste: 'Jocha',
      album: 'Fragments',
      genre: 'Trap / Spoken Word',
      duree_secondes: 183,
      date_sortie: '2024-05-02',
      description: 'Entre asphalte et espoir — une lettre aux quartiers qui nous ont construits.',
      type: 'morceau',
      vues: 3210,
      likes: 215
    },
    {
      titre: 'Archipel',
      artiste: 'Jocha',
      album: null,
      genre: 'Afro Fusion',
      duree_secondes: 241,
      date_sortie: '2024-08-20',
      description: 'Fusion de percussions africaines et de synthétiseurs modernes.',
      type: 'morceau',
      vues: 987,
      likes: 54
    },
    {
      titre: 'Instrumental No. 7 — Pluie de Nuit',
      artiste: 'Jocha',
      album: 'Instrumentales Vol.1',
      genre: 'Lo-Fi / Instrumental',
      duree_secondes: 158,
      date_sortie: '2024-01-10',
      description: 'Instrumental apaisante, idéale pour travailler ou se concentrer.',
      type: 'instrumentale',
      vues: 5634,
      likes: 401
    },
    {
      titre: 'Instrumental No. 12 — Ascension',
      artiste: 'Jocha',
      album: 'Instrumentales Vol.1',
      genre: 'Boom Bap / Instrumental',
      duree_secondes: 196,
      date_sortie: '2024-02-28',
      description: 'Boom bap old school avec des cordes orchestrales — pour les grands moments.',
      type: 'instrumentale',
      vues: 2891,
      likes: 178
    }
  ];

  const insertMorceaux = db.transaction(() => {
    for (const m of morceaux) insertMorceau.run(m);
  });
  insertMorceaux();
  console.log(`✓ ${morceaux.length} morceaux insérés`);

  // ── Œuvres visuelles ────────────────────────────────────────────────────────
  const insertOeuvre = db.prepare(`
    INSERT OR IGNORE INTO oeuvres_visuelles
      (titre, categorie, description, largeur_px, hauteur_px, appareil, lieu, date_prise, tags, vues, likes)
    VALUES
      (@titre, @categorie, @description, @largeur_px, @hauteur_px, @appareil, @lieu, @date_prise, @tags, @vues, @likes)
  `);

  const oeuvres = [
    // Portraits
    {
      titre: 'Regard vers l\'Horizon',
      categorie: 'portrait',
      description: 'Portrait en contre-jour au coucher du soleil, capturant une silhouette pensante.',
      largeur_px: 3840,
      hauteur_px: 5760,
      appareil: 'Sony A7 IV',
      lieu: 'Paris, France',
      date_prise: '2024-06-12',
      tags: 'portrait,contre-jour,soleil,silhouette',
      vues: 734,
      likes: 89
    },
    {
      titre: 'La Patience du Temps',
      categorie: 'portrait',
      description: 'Portrait en noir et blanc d\'une personne âgée, chaque ride raconte une histoire.',
      largeur_px: 4000,
      hauteur_px: 6000,
      appareil: 'Sony A7 IV',
      lieu: 'Lyon, France',
      date_prise: '2024-04-03',
      tags: 'portrait,noir-blanc,personnes-agees,emotion',
      vues: 1203,
      likes: 167
    },
    {
      titre: 'Entre Deux Mondes',
      categorie: 'portrait',
      description: 'Double exposition créative — deux identités, une seule âme.',
      largeur_px: 3000,
      hauteur_px: 4500,
      appareil: 'Canon EOS R5',
      lieu: 'Studio personnel',
      date_prise: '2024-07-28',
      tags: 'portrait,double-exposition,identite,creatif',
      vues: 2156,
      likes: 312
    },
    // Paysages
    {
      titre: 'Forêt Cathédrale',
      categorie: 'paysage',
      description: 'Sous-bois en automne, la lumière filtre entre les feuilles comme des vitraux.',
      largeur_px: 6000,
      hauteur_px: 4000,
      appareil: 'Sony A7 IV',
      lieu: 'Forêt de Fontainebleau',
      date_prise: '2023-10-18',
      tags: 'foret,automne,lumiere,nature',
      vues: 891,
      likes: 78
    },
    // Art numérique
    {
      titre: 'Fragments d\'Existence',
      categorie: 'art_numerique',
      description: 'Collage numérique explorant la fragmentation de l\'identité à l\'ère digitale.',
      largeur_px: 4096,
      hauteur_px: 4096,
      appareil: null,
      lieu: null,
      date_prise: '2024-09-05',
      tags: 'art-numerique,collage,identite,digital',
      vues: 3421,
      likes: 445
    },
    {
      titre: 'Néon Urbain',
      categorie: 'art_numerique',
      description: 'Illustration d\'une ville futuriste baignée dans des lumières néon.',
      largeur_px: 3840,
      hauteur_px: 2160,
      appareil: null,
      lieu: null,
      date_prise: '2024-11-20',
      tags: 'art-numerique,neon,ville,futuriste',
      vues: 5678,
      likes: 823
    }
  ];

  const insertOeuvres = db.transaction(() => {
    for (const o of oeuvres) insertOeuvre.run(o);
  });
  insertOeuvres();
  console.log(`✓ ${oeuvres.length} œuvres visuelles insérées`);

  fermerDB();
  console.log('\n✅ Base de données peuplée avec succès !\n');
}

peupler().catch((err) => {
  console.error('❌ Erreur lors du peuplement :', err.message);
  fermerDB();
  process.exit(1);
});
