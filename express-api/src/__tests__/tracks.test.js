/**
 * Tests — Morceaux de musique
 * Routes : GET  /api/v1/tracks
 *          GET  /api/v1/tracks/:id
 *          POST /api/v1/tracks       (protégé)
 *          PUT  /api/v1/tracks/:id   (protégé)
 *          DELETE /api/v1/tracks/:id (protégé)
 */

require('./setup');
const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const { obtenirDB, fermerDB } = require('../db/database');

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tokenAdmin;
let idMorceauTest;

beforeAll(async () => {
  const db   = obtenirDB();
  const hash = await bcrypt.hash('motdepasse_test_123', 10);
  db.prepare(`INSERT OR IGNORE INTO administrateurs (username, password) VALUES (?, ?)`).run('admin_test', hash);

  // Insérer des morceaux de test
  const stmt = db.prepare(`
    INSERT INTO morceaux (titre, artiste, genre, duree_secondes, type, vues, likes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run('Morceau Test Alpha', 'Jocha', 'R&B', 180, 'morceau', 100, 10);
  stmt.run('Instrumental Test Beta', 'Jocha', 'Lo-Fi', 120, 'instrumentale', 50, 5);
  stmt.run('Morceau Test Gamma', 'Jocha', 'Trap', 200, 'morceau', 200, 25);

  // Générer un token admin valide
  tokenAdmin = jwt.sign(
    { id: 1, username: 'admin_test', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(() => fermerDB());

// ── GET /api/v1/tracks ────────────────────────────────────────────────────────

describe('GET /api/v1/tracks', () => {

  test('✓ Retourne la liste des morceaux avec pagination', async () => {
    const res = await request(app).get('/api/v1/tracks');

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(Array.isArray(res.body.donnees)).toBe(true);
    expect(res.body.donnees.length).toBeGreaterThanOrEqual(3);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('page');
  });

  test('✓ Filtre par type "instrumentale"', async () => {
    const res = await request(app).get('/api/v1/tracks?type=instrumentale');

    expect(res.statusCode).toBe(200);
    res.body.donnees.forEach(m => {
      expect(m.type).toBe('instrumentale');
    });
  });

  test('✓ Filtre par type "morceau"', async () => {
    const res = await request(app).get('/api/v1/tracks?type=morceau');

    expect(res.statusCode).toBe(200);
    res.body.donnees.forEach(m => {
      expect(m.type).toBe('morceau');
    });
  });

  test('✓ Pagination : page 1 avec limite 2', async () => {
    const res = await request(app).get('/api/v1/tracks?page=1&limite=2');

    expect(res.statusCode).toBe(200);
    expect(res.body.donnees.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination.limite).toBe(2);
    expect(res.body.pagination.page).toBe(1);
  });

  test('✓ Tri par vues décroissant', async () => {
    const res = await request(app).get('/api/v1/tracks?tri=vues&ordre=desc');

    expect(res.statusCode).toBe(200);
    const vues = res.body.donnees.map(m => m.statistiques.vues);
    for (let i = 0; i < vues.length - 1; i++) {
      expect(vues[i]).toBeGreaterThanOrEqual(vues[i + 1]);
    }
  });

  test('✓ Structure correcte d\'un morceau (champs requis)', async () => {
    const res = await request(app).get('/api/v1/tracks');
    const morceau = res.body.donnees[0];

    expect(morceau).toHaveProperty('id');
    expect(morceau).toHaveProperty('titre');
    expect(morceau).toHaveProperty('artiste');
    expect(morceau).toHaveProperty('type');
    expect(morceau).toHaveProperty('duree');
    expect(morceau).toHaveProperty('statistiques');
    expect(morceau.statistiques).toHaveProperty('vues');
    expect(morceau.statistiques).toHaveProperty('likes');
    expect(morceau).toHaveProperty('media');
  });

  test('✗ Paramètre type invalide', async () => {
    const res = await request(app).get('/api/v1/tracks?type=invalide');
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/v1/tracks/:id ────────────────────────────────────────────────────

describe('GET /api/v1/tracks/:id', () => {

  test('✓ Retourne le détail d\'un morceau existant', async () => {
    // Récupérer l'ID d'un morceau existant
    const liste = await request(app).get('/api/v1/tracks');
    const id    = liste.body.donnees[0].id;

    const res = await request(app).get(`/api/v1/tracks/${id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.donnees.id).toBe(id);
  });

  test('✓ Incrémente le compteur de vues', async () => {
    const liste     = await request(app).get('/api/v1/tracks');
    const morceau   = liste.body.donnees[0];
    const vuesAvant = morceau.statistiques.vues;

    await request(app).get(`/api/v1/tracks/${morceau.id}`);
    const res = await request(app).get(`/api/v1/tracks/${morceau.id}`);

    expect(res.body.donnees.statistiques.vues).toBeGreaterThan(vuesAvant);
  });

  test('✗ Retourne 404 pour un ID inexistant', async () => {
    const res = await request(app).get('/api/v1/tracks/99999');
    expect(res.statusCode).toBe(404);
    expect(res.body.succes).toBe(false);
  });

  test('✗ Retourne 400 pour un ID non numérique', async () => {
    const res = await request(app).get('/api/v1/tracks/abc');
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /api/v1/tracks (protégé) ─────────────────────────────────────────────

describe('POST /api/v1/tracks', () => {

  test('✓ Crée un morceau avec token admin valide', async () => {
    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        titre: 'Nouveau Morceau Test',
        type:  'morceau',
        genre: 'Soul',
        duree_secondes: 195
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.succes).toBe(true);
    expect(res.body.donnees.titre).toBe('Nouveau Morceau Test');

    idMorceauTest = res.body.donnees.id;
  });

  test('✗ Rejet sans token JWT', async () => {
    const res = await request(app)
      .post('/api/v1/tracks')
      .send({ titre: 'Test', type: 'morceau' });

    expect(res.statusCode).toBe(401);
  });

  test('✗ Rejet avec token invalide', async () => {
    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', 'Bearer token.bidon')
      .send({ titre: 'Test', type: 'morceau' });

    expect(res.statusCode).toBe(403);
  });

  test('✗ Rejet si titre manquant', async () => {
    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ type: 'morceau' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('erreurs');
  });

  test('✗ Rejet si type invalide', async () => {
    const res = await request(app)
      .post('/api/v1/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titre: 'Test', type: 'podcast' });

    expect(res.statusCode).toBe(400);
  });
});

// ── PUT /api/v1/tracks/:id (protégé) ──────────────────────────────────────────

describe('PUT /api/v1/tracks/:id', () => {

  test('✓ Modifie un morceau existant', async () => {
    const res = await request(app)
      .put(`/api/v1/tracks/${idMorceauTest}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titre: 'Titre Modifié', genre: 'Afro Fusion' });

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.donnees.titre).toBe('Titre Modifié');
  });

  test('✗ Rejet sans token', async () => {
    const res = await request(app)
      .put(`/api/v1/tracks/${idMorceauTest}`)
      .send({ titre: 'Test' });

    expect(res.statusCode).toBe(401);
  });

  test('✗ Retourne 404 pour un ID inexistant', async () => {
    const res = await request(app)
      .put('/api/v1/tracks/99999')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ titre: 'Test' });

    expect(res.statusCode).toBe(404);
  });

  test('✗ Rejet si aucun champ fourni', async () => {
    const res = await request(app)
      .put(`/api/v1/tracks/${idMorceauTest}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({});

    expect(res.statusCode).toBe(400);
  });
});

// ── DELETE /api/v1/tracks/:id (protégé) ───────────────────────────────────────

describe('DELETE /api/v1/tracks/:id', () => {

  test('✓ Supprime un morceau existant', async () => {
    const res = await request(app)
      .delete(`/api/v1/tracks/${idMorceauTest}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
  });

  test('✗ Retourne 404 après suppression', async () => {
    const res = await request(app).get(`/api/v1/tracks/${idMorceauTest}`);
    expect(res.statusCode).toBe(404);
  });

  test('✗ Rejet sans token', async () => {
    const res = await request(app).delete('/api/v1/tracks/1');
    expect(res.statusCode).toBe(401);
  });
});
