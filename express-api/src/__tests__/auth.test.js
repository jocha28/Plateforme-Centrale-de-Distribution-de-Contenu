/**
 * Tests — Authentification JWT
 * Route : POST /api/v1/auth/login
 *         GET  /api/v1/auth/moi
 */

require('./setup');
const request = require('supertest');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const { obtenirDB, fermerDB } = require('../db/database');

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tokenAdmin;

beforeAll(async () => {
  const db   = obtenirDB();
  const hash = await bcrypt.hash('motdepasse_test_123', 10);
  db.prepare(`
    INSERT OR IGNORE INTO administrateurs (username, password) VALUES (?, ?)
  `).run('admin_test', hash);
});

afterAll(() => {
  fermerDB();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {

  test('✓ Connexion réussie avec identifiants valides', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin_test', password: 'motdepasse_test_123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body).toHaveProperty('token');
    expect(res.body.utilisateur.username).toBe('admin_test');
    expect(res.body.utilisateur.role).toBe('admin');

    tokenAdmin = res.body.token; // Conserver pour les autres tests
  });

  test('✗ Rejet avec mot de passe incorrect', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin_test', password: 'mauvais_mdp' });

    expect(res.statusCode).toBe(401);
    expect(res.body.succes).toBe(false);
    expect(res.body).not.toHaveProperty('token');
  });

  test('✗ Rejet avec utilisateur inexistant', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'inconnu', password: 'motdepasse' });

    expect(res.statusCode).toBe(401);
    expect(res.body.succes).toBe(false);
  });

  test('✗ Rejet avec champs manquants (validation)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.succes).toBe(false);
    expect(res.body).toHaveProperty('erreurs');
  });

  test('✗ Rejet avec mot de passe trop court', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin_test', password: 'abc' });

    expect(res.statusCode).toBe(400);
    expect(res.body.succes).toBe(false);
  });
});

describe('GET /api/v1/auth/moi', () => {

  test('✓ Retourne les infos utilisateur avec un token valide', async () => {
    // Obtenir un token d'abord
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin_test', password: 'motdepasse_test_123' });

    const res = await request(app)
      .get('/api/v1/auth/moi')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.utilisateur.username).toBe('admin_test');
    expect(res.body.utilisateur.role).toBe('admin');
  });

  test('✗ Rejet sans token', async () => {
    const res = await request(app).get('/api/v1/auth/moi');
    expect(res.statusCode).toBe(401);
  });

  test('✗ Rejet avec token falsifié', async () => {
    const res = await request(app)
      .get('/api/v1/auth/moi')
      .set('Authorization', 'Bearer token.faux.invalide');
    expect(res.statusCode).toBe(401);
  });
});
