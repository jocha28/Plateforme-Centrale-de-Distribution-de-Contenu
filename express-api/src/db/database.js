const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'plateforme.db');

let db;

/**
 * Obtenir l'instance unique de la base de données (pattern Singleton).
 * Crée les tables si elles n'existent pas encore.
 */
function obtenirDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');   // Meilleures performances en lecture/écriture simultanée
    db.pragma('foreign_keys = ON');    // Activer les clés étrangères

    initialiserSchema();
  }
  return db;
}

/**
 * Créer le schéma complet de la base de données.
 */
function initialiserSchema() {
  // Table des administrateurs
  db.exec(`
    CREATE TABLE IF NOT EXISTS administrateurs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      cree_le    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Table des morceaux de musique / instrumentales
  db.exec(`
    CREATE TABLE IF NOT EXISTS morceaux (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      titre           TEXT    NOT NULL,
      artiste         TEXT    NOT NULL DEFAULT 'Jocha',
      album           TEXT,
      genre           TEXT,
      duree_secondes  INTEGER,
      date_sortie     TEXT,
      description     TEXT,
      fichier_audio   TEXT,
      image_couverture TEXT,
      type            TEXT    NOT NULL CHECK(type IN ('morceau', 'instrumentale')) DEFAULT 'morceau',
      vues            INTEGER NOT NULL DEFAULT 0,
      likes           INTEGER NOT NULL DEFAULT 0,
      cree_le         TEXT    NOT NULL DEFAULT (datetime('now')),
      modifie_le      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Table des œuvres visuelles (photographies, art numérique)
  db.exec(`
    CREATE TABLE IF NOT EXISTS oeuvres_visuelles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      titre        TEXT    NOT NULL,
      categorie    TEXT    NOT NULL CHECK(categorie IN ('portrait', 'paysage', 'art_numerique', 'abstrait', 'autre')),
      description  TEXT,
      fichier      TEXT,
      miniature    TEXT,
      largeur_px   INTEGER,
      hauteur_px   INTEGER,
      appareil     TEXT,
      lieu         TEXT,
      date_prise   TEXT,
      tags         TEXT,
      vues         INTEGER NOT NULL DEFAULT 0,
      likes        INTEGER NOT NULL DEFAULT 0,
      cree_le      TEXT    NOT NULL DEFAULT (datetime('now')),
      modifie_le   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Table générique pour tout type de contenu futur
  db.exec(`
    CREATE TABLE IF NOT EXISTS contenus (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type_contenu TEXT    NOT NULL,
      titre        TEXT    NOT NULL,
      description  TEXT,
      donnees_json TEXT,
      publie       INTEGER NOT NULL DEFAULT 1,
      cree_le      TEXT    NOT NULL DEFAULT (datetime('now')),
      modifie_le   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  console.log('✓ Schéma de la base de données initialisé');
}

/**
 * Fermer proprement la connexion à la base.
 */
function fermerDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { obtenirDB, fermerDB };
