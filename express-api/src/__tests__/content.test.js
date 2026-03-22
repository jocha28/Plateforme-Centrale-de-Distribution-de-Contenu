/**
 * Tests — Content & Stats
 * Routes : POST /api/v1/content      (protégé)
 *          GET  /api/v1/content/stats (public)
 *          GET  /api/v1/social/stats  (public — API tierce mockée)
 */

require('./setup');
const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const { obtenirDB, fermerDB } = require('../db/database');

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tokenAdmin;

beforeAll(async () => {
  const db   = obtenirDB();
  const hash = await bcrypt.hash('motdepasse_test_123', 10);
  db.prepare(`INSERT OR IGNORE INTO administrateurs (username, password) VALUES (?, ?)`).run('admin_test', hash);

  // Insérer quelques données pour les stats
  db.prepare(`INSERT INTO morceaux (titre, type, vues, likes) VALUES (?, ?, ?, ?)`).run('Morceau Stats 1', 'morceau', 1000, 80);
  db.prepare(`INSERT INTO morceaux (titre, type, vues, likes) VALUES (?, ?, ?, ?)`).run('Morceau Stats 2', 'instrumentale', 500, 30);
  db.prepare(`INSERT INTO oeuvres_visuelles (titre, categorie, vues, likes) VALUES (?, ?, ?, ?)`).run('Photo Stats 1', 'portrait', 300, 25);

  tokenAdmin = jwt.sign(
    { id: 1, username: 'admin_test', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(() => fermerDB());

// ── POST /api/v1/content ─────────────────────────────────────────────────────

describe('POST /api/v1/content', () => {

  test('✓ Ajoute un morceau via /content', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('type_contenu', 'morceau')
      .field('titre', 'Track via Content Route')
      .field('genre', 'Afro')
      .field('description', 'Ajouté via POST /content');

    expect(res.statusCode).toBe(201);
    expect(res.body.succes).toBe(true);
    expect(res.body.type).toBe('audio');
    expect(res.body.donnees.titre).toBe('Track via Content Route');
  });

  test('✓ Ajoute une œuvre visuelle (portrait)', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('type_contenu', 'portrait')
      .field('titre', 'Portrait via Content Route')
      .field('description', 'Photo test')
      .field('lieu', 'Paris');

    expect(res.statusCode).toBe(201);
    expect(res.body.succes).toBe(true);
    expect(res.body.type).toBe('visuel');
    expect(res.body.donnees.titre).toBe('Portrait via Content Route');
  });

  test('✓ Ajoute une instrumentale', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('type_contenu', 'instrumentale')
      .field('titre', 'Beat via Content Route')
      .field('duree_secondes', '160');

    expect(res.statusCode).toBe(201);
    expect(res.body.type).toBe('audio');
  });

  test('✗ Rejet sans authentification', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .field('type_contenu', 'morceau')
      .field('titre', 'Test sans auth');

    expect(res.statusCode).toBe(401);
  });

  test('✗ Rejet si type_contenu manquant', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('titre', 'Test sans type');

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('erreurs');
  });

  test('✗ Rejet si titre manquant', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('type_contenu', 'morceau');

    expect(res.statusCode).toBe(400);
  });

  test('✗ Rejet si type_contenu invalide', async () => {
    const res = await request(app)
      .post('/api/v1/content')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('type_contenu', 'podcast')
      .field('titre', 'Test type invalide');

    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/v1/content/stats ────────────────────────────────────────────────

describe('GET /api/v1/content/stats', () => {

  test('✓ Retourne les statistiques globales', async () => {
    const res = await request(app).get('/api/v1/content/stats');

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.donnees).toHaveProperty('musique');
    expect(res.body.donnees).toHaveProperty('visuels');
    expect(res.body.donnees).toHaveProperty('global');
  });

  test('✓ Les stats musique contiennent les bons champs', async () => {
    const res    = await request(app).get('/api/v1/content/stats');
    const musique = res.body.donnees.musique;

    expect(musique).toHaveProperty('total');
    expect(musique).toHaveProperty('morceaux');
    expect(musique).toHaveProperty('instrumentales');
    expect(musique).toHaveProperty('vues');
    expect(musique).toHaveProperty('likes');
    expect(musique.total).toBeGreaterThanOrEqual(2);
  });

  test('✓ Le total global est cohérent', async () => {
    const res    = await request(app).get('/api/v1/content/stats');
    const donnees = res.body.donnees;

    expect(donnees.global.totalOeuvres).toBe(
      donnees.musique.total + donnees.visuels.total
    );
    expect(donnees.global.totalVues).toBe(
      donnees.musique.vues + donnees.visuels.vues
    );
  });

  test('✓ Les tops morceaux et visuels sont des tableaux', async () => {
    const res = await request(app).get('/api/v1/content/stats');

    expect(Array.isArray(res.body.donnees.topMorceaux)).toBe(true);
    expect(Array.isArray(res.body.donnees.topVisuelles)).toBe(true);
    expect(res.body.donnees.topMorceaux.length).toBeLessThanOrEqual(3);
  });

  test('✓ Accessible sans authentification (route publique)', async () => {
    const res = await request(app).get('/api/v1/content/stats');
    // Ne doit pas retourner 401 ou 403
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });
});

// ── GET /api/v1/social/stats ─────────────────────────────────────────────────

describe('GET /api/v1/social/stats (API tierce)', () => {

  test('✓ Retourne les stats simulées pour un ID YouTube', async () => {
    const res = await request(app)
      .get('/api/v1/social/stats?youtubeId=dQw4w9WgXcQ');

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.donnees).toHaveProperty('stats');
    expect(res.body.donnees.stats).toHaveProperty('youtube');
    expect(res.body.donnees.stats.youtube).toHaveProperty('statistiques');
    expect(res.body.donnees.stats.youtube.statistiques).toHaveProperty('vues');
  });

  test('✓ Retourne un résumé consolidé', async () => {
    const res = await request(app)
      .get('/api/v1/social/stats?youtubeId=test123');

    expect(res.body.donnees).toHaveProperty('consolide');
    expect(res.body.donnees.consolide).toHaveProperty('totalVues');
    expect(res.body.donnees.consolide).toHaveProperty('totalLikes');
  });

  test('✗ Retourne 400 sans paramètre', async () => {
    const res = await request(app).get('/api/v1/social/stats');

    expect(res.statusCode).toBe(400);
    expect(res.body.succes).toBe(false);
    expect(res.body).toHaveProperty('message');
  });
});

// ── Middleware JWT — cas généraux ────────────────────────────────────────────

describe('Middleware JWT — protection des routes', () => {

  test('✗ Token expiré (simulé avec exp passé)', async () => {
    const tokenExpire = jwt.sign(
      { id: 1, username: 'admin_test', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // Déjà expiré
    );

    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', `Bearer ${tokenExpire}`)
      .send({ titre: 'Test', type: 'morceau' });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/expir/i);
  });

  test('✗ Token sans rôle admin', async () => {
    const tokenSansRole = jwt.sign(
      { id: 99, username: 'user_normal' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', `Bearer ${tokenSansRole}`)
      .send({ titre: 'Test', type: 'morceau' });

    expect(res.statusCode).toBe(403);
  });

  test('✗ Header Authorization mal formaté', async () => {
    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', 'token_sans_bearer')
      .send({ titre: 'Test', type: 'morceau' });

    expect(res.statusCode).toBe(401);
  });
});
