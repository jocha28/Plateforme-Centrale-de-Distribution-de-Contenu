# Plateforme Centrale de Distribution de Contenu

*Backend API pour centraliser et distribuer des créations artistiques — musique, instrumentales, photographies et art numérique.*

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-29-C21325?style=for-the-badge&logo=jest&logoColor=white)
![Pytest](https://img.shields.io/badge/Pytest-8-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Tests Express](https://img.shields.io/badge/Tests%20Express-63%20pass%C3%A9s-brightgreen?style=for-the-badge)
![Tests FastAPI](https://img.shields.io/badge/Tests%20FastAPI-21%20pass%C3%A9s-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

---

## Vue d'ensemble

Ce projet est une **API REST double-service** qui sert de backend à une plateforme personnelle centralisant toutes les créations d'un artiste. Tout frontend (site web, app mobile, CLI) peut consommer ces endpoints pour afficher du contenu en lecture publique, ou le gérer via une authentification administrateur.

L'architecture sépare la **logique métier** (Express.js) du **traitement des fichiers médias** (FastAPI), permettant à chaque service d'évoluer indépendamment.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       Clients                            │
│           (App Mobile / Site Web / CLI / Postman)        │
└─────────────────────┬────────────────────────────────────┘
                      │  HTTP
         ┌────────────▼────────────┐
         │      Express API        │  :3000
         │    (API Principale)     │
         │                         │
         │  • Authentification JWT │
         │  • Routes CRUD          │
         │  • Base de données      │
         │  • Stats & API tierces  │
         └────────────┬────────────┘
                      │  HTTP interne
         ┌────────────▼────────────┐
         │    FastAPI Service      │  :8000
         │    (Service Médias)     │
         │                         │
         │  • Upload audio/images  │
         │  • Streaming audio      │
         │  • Génération miniatures│
         │  • Extraction métadonnées│
         └─────────────────────────┘
```

---

## Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| **API principale** | Express.js | Routing, logique métier, CRUD |
| **Service médias** | FastAPI | Upload, streaming, traitement fichiers |
| **Base de données** | SQLite (`better-sqlite3`) | Persistance des métadonnées |
| **Authentification** | JWT HS256 | Tokens partagés entre les deux services |
| **Upload fichiers** | Multer | Gestion des fichiers multipart |
| **Traitement images** | Pillow | Redimensionnement, miniatures, EXIF |
| **Traitement audio** | Mutagen | Tags ID3, durée, bitrate |
| **Validation** | Pydantic + express-validator | Schémas et validation des données |
| **Sécurité** | Helmet + CORS + Rate limiting | Headers HTTP sécurisés |
| **Tests Express** | Jest + Supertest | 63 tests unitaires et d'intégration |
| **Tests FastAPI** | Pytest + httpx | 21 tests asynchrones |
| **Déploiement** | Docker Compose | Orchestration des deux services |

---

## Endpoints

### Publics — lecture seule

Aucune authentification requise.

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/tracks` | Liste des morceaux avec filtres (`type`, `genre`, `tri`, `page`) |
| `GET` | `/api/v1/tracks/:id` | Détail d'un morceau + incrément des vues |
| `GET` | `/api/v1/gallery` | Toutes les œuvres visuelles avec résumé par catégorie |
| `GET` | `/api/v1/gallery/portraits` | Série photographique portraits |
| `GET` | `/api/v1/gallery/:categorie` | Filtrer par catégorie (`paysage`, `art_numerique`, `abstrait`…) |
| `GET` | `/api/v1/gallery/oeuvre/:id` | Détail d'une œuvre visuelle |
| `GET` | `/api/v1/content/stats` | Statistiques globales de la plateforme |
| `GET` | `/api/v1/social/stats` | Stats YouTube / SoundCloud (API tierces) |
| `GET` | `/api/v1` | Index de tous les endpoints disponibles |
| `GET` | `/health` | Santé du service |

### Protégés — JWT admin requis

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/v1/auth/login` | Connexion administrateur → retourne un JWT |
| `GET` | `/api/v1/auth/moi` | Infos de l'utilisateur connecté |
| `POST` | `/api/v1/tracks` | Ajouter un morceau |
| `PUT` | `/api/v1/tracks/:id` | Modifier un morceau |
| `DELETE` | `/api/v1/tracks/:id` | Supprimer un morceau |
| `POST` | `/api/v1/content` | Ajouter toute œuvre avec upload de fichier |
| `PUT` | `/api/v1/content/:type/:id` | Modifier une œuvre (`track` ou `gallery`) |
| `DELETE` | `/api/v1/content/:type/:id` | Supprimer une œuvre |

### FastAPI — Service médias (port 8000)

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/media/upload` | Uploader un fichier audio ou image `[JWT]` |
| `GET` | `/media/stream/:id` | Streaming audio (support header `Range`) |
| `GET` | `/media/image/:id` | Servir une image (cache 1h) |
| `GET` | `/media/miniature/:id` | Miniature 400×400 auto-générée |
| `GET` | `/media/metadata/:id` | Métadonnées : EXIF, tags ID3, durée, bitrate |
| `DELETE` | `/media/:id` | Supprimer fichier + miniature `[JWT]` |
| `GET` | `/docs` | Documentation Swagger UI interactive |

---

## Installation

### Prérequis

- Node.js >= 18
- Python >= 3.10

### Option 1 — Démarrage manuel

#### Express API

```bash
cd express-api
npm install
cp .env.example .env       # Remplir JWT_SECRET et ADMIN_PASSWORD
npm run seed               # Peupler la BDD avec des données de démo
npm run dev                # Démarre sur http://localhost:3000
```

#### FastAPI Service

```bash
cd fastapi-service
python -m venv .venv
source .venv/bin/activate  # Windows : .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

La documentation Swagger est disponible sur <http://localhost:8000/docs>.

### Option 2 — Docker Compose

```bash
cp express-api/.env.example express-api/.env   # Remplir les variables
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Express API | <http://localhost:3000/api/v1> |
| FastAPI Swagger | <http://localhost:8000/docs> |

---

## Authentification

L'API utilise **JWT (JSON Web Tokens)** avec algorithme `HS256`. Le même secret est partagé entre Express et FastAPI — un token obtenu via Express fonctionne directement sur les routes FastAPI.

### Obtenir un token

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "votre_mot_de_passe"}'
```

### Utiliser le token

```bash
# Ajouter un morceau (Express)
curl -X POST http://localhost:3000/api/v1/tracks \
  -H "Authorization: Bearer <votre_token>" \
  -H "Content-Type: application/json" \
  -d '{"titre": "Mon morceau", "type": "morceau", "genre": "R&B"}'

# Uploader une image (FastAPI)
curl -X POST http://localhost:8000/media/upload \
  -H "Authorization: Bearer <votre_token>" \
  -F "fichier=@photo.jpg"
```

---

## Lancer les tests

### Express API — 63 tests

```bash
cd express-api
npm test                        # Avec rapport de coverage
npx jest --watchAll             # Mode watch
```

### FastAPI — 21 tests

```bash
cd fastapi-service
source .venv/bin/activate
pytest -v                       # Détail par test
pytest --tb=short               # Résumé compact
```

---

## Structure du projet

```
.
├── express-api/
│   ├── src/
│   │   ├── __tests__/          → Tests Jest (auth, tracks, gallery, content)
│   │   ├── db/
│   │   │   ├── database.js     → Schéma SQLite + connexion Singleton
│   │   │   └── seed.js         → Données de démonstration
│   │   ├── middleware/
│   │   │   └── auth.js         → Vérification JWT + contrôle des rôles
│   │   ├── routes/
│   │   │   ├── auth.js         → POST /auth/login, GET /auth/moi
│   │   │   ├── tracks.js       → CRUD morceaux
│   │   │   ├── gallery.js      → CRUD œuvres visuelles
│   │   │   └── content.js      → Upload générique + stats
│   │   ├── services/
│   │   │   └── socialStats.js  → YouTube API v3 + SoundCloud (fallback simulation)
│   │   └── app.js              → Point d'entrée Express
│   ├── uploads/                → Fichiers uploadés (ignoré par git)
│   ├── .env.example
│   └── package.json
│
├── fastapi-service/
│   ├── tests/
│   │   ├── conftest.py         → Fixtures pytest (tokens JWT, fichiers de test)
│   │   └── test_media.py       → 21 tests upload/stream/image/delete
│   ├── models/
│   │   └── schemas.py          → Schémas Pydantic
│   ├── routes/
│   │   └── media.py            → Tous les endpoints médias
│   ├── services/
│   │   └── media_service.py    → Upload, miniatures (Pillow), métadonnées (Mutagen)
│   ├── main.py                 → Point d'entrée FastAPI
│   ├── pytest.ini
│   └── requirements.txt
│
├── docker-compose.yml
└── README.md
```

---

## Variables d'environnement

Copier les fichiers `.env.example` et renseigner les valeurs.

| Variable | Service | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Express + FastAPI | Clé secrète partagée (`openssl rand -hex 64`) |
| `ADMIN_PASSWORD` | Express | Mot de passe du compte admin |
| `DB_PATH` | Express | Chemin vers le fichier SQLite |
| `FASTAPI_URL` | Express | URL interne du service FastAPI |
| `YOUTUBE_API_KEY` | Express | Clé YouTube Data API v3 (optionnel) |
| `SOUNDCLOUD_CLIENT_ID` | Express | Client ID SoundCloud (optionnel) |
| `UPLOAD_DIR` | FastAPI | Dossier de stockage des médias |
| `MAX_UPLOAD_MB` | FastAPI | Taille maximale par fichier |

> Sans clés d'API YouTube/SoundCloud, le service retourne automatiquement des statistiques simulées cohérentes.
