/**
 * Tests — Galerie photographique et art numérique
 * Routes : GET /api/v1/gallery
 *          GET /api/v1/gallery/portraits
 *          GET /api/v1/gallery/:categorie
 *          GET /api/v1/gallery/oeuvre/:id
 *          DELETE /api/v1/gallery/:id (protégé)
 */

require('./setup');
const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const { obtenirDB, fermerDB } = require('../db/database');

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tokenAdmin;
let idOeuvreTest;

beforeAll(async () => {
  const db   = obtenirDB();
  const hash = await bcrypt.hash('motdepasse_test_123', 10);
  db.prepare(`INSERT OR IGNORE INTO administrateurs (username, password) VALUES (?, ?)`).run('admin_test', hash);

  // Insérer des œuvres de test
  const stmt = db.prepare(`
    INSERT INTO oeuvres_visuelles (titre, categorie, description, tags, vues, likes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run('Portrait Test 1', 'portrait',     'Un beau portrait', 'portrait,test', 150, 20);
  stmt.run('Portrait Test 2', 'portrait',     'Un autre portrait', 'portrait', 80, 8);
  stmt.run('Paysage Test 1',  'paysage',      'Un paysage', 'nature', 60, 5);
  stmt.run('Art Num Test 1',  'art_numerique','Art digital', 'digital,art', 300, 45);

  tokenAdmin = jwt.sign(
    { id: 1, username: 'admin_test', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(() => fermerDB());

// ── GET /api/v1/gallery ───────────────────────────────────────────────────────

describe('GET /api/v1/gallery', () => {

  test('✓ Retourne toutes les œuvres avec pagination et résumé', async () => {
    const res = await request(app).get('/api/v1/gallery');

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(Array.isArray(res.body.donnees)).toBe(true);
    expect(res.body.donnees.length).toBeGreaterThanOrEqual(4);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body).toHaveProperty('resume');
    expect(res.body.resume).toHaveProperty('total');
    expect(Array.isArray(res.body.resume.parCategorie)).toBe(true);
  });

  test('✓ Structure correcte d\'une œuvre visuelle', async () => {
    const res    = await request(app).get('/api/v1/gallery');
    const oeuvre = res.body.donnees[0];

    expect(oeuvre).toHaveProperty('id');
    expect(oeuvre).toHaveProperty('titre');
    expect(oeuvre).toHaveProperty('categorie');
    expect(oeuvre).toHaveProperty('media');
    expect(oeuvre).toHaveProperty('statistiques');
    expect(oeuvre).toHaveProperty('tags');
    expect(Array.isArray(oeuvre.tags)).toBe(true);
    expect(oeuvre).toHaveProperty('exif');
    expect(oeuvre).toHaveProperty('dimensions');
  });

  test('✓ Pagination : limite 2', async () => {
    const res = await request(app).get('/api/v1/gallery?limite=2');

    expect(res.statusCode).toBe(200);
    expect(res.body.donnees.length).toBeLessThanOrEqual(2);
  });
});

// ── GET /api/v1/gallery/portraits ─────────────────────────────────────────────

describe('GET /api/v1/gallery/portraits', () => {

  test('✓ Retourne uniquement les portraits', async () => {
    const res = await request(app).get('/api/v1/gallery/portraits');

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.categorie).toBe('portrait');
    expect(Array.isArray(res.body.donnees)).toBe(true);
    expect(res.body.donnees.length).toBeGreaterThanOrEqual(2);
    res.body.donnees.forEach(o => {
      expect(o.categorie).toBe('portrait');
    });
  });

  test('✓ Contient les champs de pagination', async () => {
    const res = await request(app).get('/api/v1/gallery/portraits');

    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
  });
});

// ── GET /api/v1/gallery/:categorie ────────────────────────────────────────────

describe('GET /api/v1/gallery/:categorie', () => {

  test('✓ Filtre par catégorie "paysage"', async () => {
    const res = await request(app).get('/api/v1/gallery/paysage');

    expect(res.statusCode).toBe(200);
    expect(res.body.categorie).toBe('paysage');
    res.body.donnees.forEach(o => {
      expect(o.categorie).toBe('paysage');
    });
  });

  test('✓ Filtre par catégorie "art_numerique"', async () => {
    const res = await request(app).get('/api/v1/gallery/art_numerique');

    expect(res.statusCode).toBe(200);
    res.body.donnees.forEach(o => {
      expect(o.categorie).toBe('art_numerique');
    });
  });

  test('✗ Retourne 400 pour une catégorie invalide', async () => {
    const res = await request(app).get('/api/v1/gallery/concerts');
    expect(res.statusCode).toBe(400);
    expect(res.body.succes).toBe(false);
  });
});

// ── GET /api/v1/gallery/oeuvre/:id ────────────────────────────────────────────

describe('GET /api/v1/gallery/oeuvre/:id', () => {

  test('✓ Retourne le détail d\'une œuvre existante', async () => {
    const liste = await request(app).get('/api/v1/gallery');
    const id    = liste.body.donnees[0].id;

    const res = await request(app).get(`/api/v1/gallery/oeuvre/${id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.donnees.id).toBe(id);
  });

  test('✓ Incrémente le compteur de vues', async () => {
    const liste     = await request(app).get('/api/v1/gallery');
    const oeuvre    = liste.body.donnees[0];
    const vuesAvant = oeuvre.statistiques.vues;
    const id        = oeuvre.id;

    await request(app).get(`/api/v1/gallery/oeuvre/${id}`);
    const res = await request(app).get(`/api/v1/gallery/oeuvre/${id}`);

    expect(res.body.donnees.statistiques.vues).toBeGreaterThan(vuesAvant);
  });

  test('✗ Retourne 404 pour un ID inexistant', async () => {
    const res = await request(app).get('/api/v1/gallery/oeuvre/99999');
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /api/v1/gallery/:id (protégé) ──────────────────────────────────────

describe('DELETE /api/v1/gallery/:id', () => {

  test('✓ Supprime une œuvre avec token admin', async () => {
    // Créer une œuvre à supprimer
    const db = obtenirDB();
    const r  = db.prepare(`
      INSERT INTO oeuvres_visuelles (titre, categorie) VALUES (?, ?)
    `).run('Œuvre à supprimer', 'abstrait');

    const res = await request(app)
      .delete(`/api/v1/gallery/${r.lastInsertRowid}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
  });

  test('✗ Rejet sans token', async () => {
    const res = await request(app).delete('/api/v1/gallery/1');
    expect(res.statusCode).toBe(401);
  });

  test('✗ Retourne 404 pour un ID inexistant', async () => {
    const res = await request(app)
      .delete('/api/v1/gallery/99999')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.statusCode).toBe(404);
  });
});
