# Plateforme Centrale de Distribution de Contenu

API REST backend pour centraliser et distribuer des créations artistiques : musique, instrumentales, photographies et art numérique.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
│         (App Mobile / Site Web / CLI)                   │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   Express API       │  :3000
          │   (API Principale)  │
          │   - Auth JWT        │
          │   - Routes CRUD     │
          │   - Base SQLite     │
          └──────────┬──────────┘
                     │ HTTP interne
          ┌──────────▼──────────┐
          │   FastAPI Service   │  :8000
          │   (Service Médias)  │
          │   - Upload fichiers │
          │   - Métadonnées     │
          │   - Streaming       │
          └─────────────────────┘
```

## Services

### Express API (Port 3000)
API principale gérant l'authentification, les routes publiques et la logique métier.

### FastAPI Service (Port 8000)
Microservice Python dédié à la gestion des fichiers médias (upload, streaming, extraction de métadonnées).

## Endpoints

### Publics (lecture seule)
| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/tracks` | Liste des morceaux avec métadonnées |
| `GET` | `/api/v1/tracks/:id` | Détail d'un morceau |
| `GET` | `/api/v1/gallery` | Toutes les galeries |
| `GET` | `/api/v1/gallery/portraits` | Série photographique portraits |
| `GET` | `/api/v1/gallery/:categorie` | Galerie par catégorie |
| `GET` | `/api/v1/stats` | Statistiques de la plateforme |

### Protégés (JWT requis — Admin uniquement)
| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/v1/auth/login` | Connexion administrateur |
| `POST` | `/api/v1/content` | Ajouter une nouvelle œuvre |
| `PUT` | `/api/v1/content/:id` | Modifier une œuvre |
| `DELETE` | `/api/v1/content/:id` | Supprimer une œuvre |

### FastAPI — Médias
| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/media/upload` | Uploader un fichier média |
| `GET` | `/media/stream/:id` | Streamer un fichier audio |
| `GET` | `/media/image/:id` | Servir une image |
| `GET` | `/media/metadata/:id` | Extraire les métadonnées |

## Installation

### Prérequis
- Node.js >= 18
- Python >= 3.10
- npm ou yarn

### Express API
```bash
cd express-api
npm install
cp .env.example .env
# Éditer .env avec vos valeurs
npm run dev
```

### FastAPI Service
```bash
cd fastapi-service
python -m venv .venv
source .venv/bin/activate   # Linux/Mac
# .venv\Scripts\activate    # Windows
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### Avec Docker Compose
```bash
docker-compose up --build
```

## Authentification

L'API utilise JWT (JSON Web Tokens). Pour les routes protégées, inclure le token dans le header :
```
Authorization: Bearer <votre_token>
```

Obtenir un token :
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "votre_mot_de_passe"}'
```

## Variables d'environnement

Voir `express-api/.env.example` et `fastapi-service/.env.example`.

## Technologies

| Technologie | Rôle |
|-------------|------|
| Node.js + Express | API REST principale |
| Python + FastAPI | Service de gestion des médias |
| SQLite (better-sqlite3) | Base de données |
| JWT (jsonwebtoken) | Authentification |
| Multer | Upload de fichiers |
| Bcrypt | Hachage des mots de passe |

## Structure du projet

```
.
├── express-api/
│   ├── src/
│   │   ├── db/           → Base de données SQLite + seed
│   │   ├── middleware/   → Vérification JWT, validation
│   │   ├── routes/       → Tous les endpoints
│   │   └── services/     → Logique métier externe
│   ├── uploads/          → Fichiers médias (ignoré par git)
│   ├── package.json
│   └── .env.example
├── fastapi-service/
│   ├── routes/           → Endpoints FastAPI
│   ├── models/           → Schémas Pydantic
│   ├── services/         → Traitement des fichiers
│   ├── main.py
│   └── requirements.txt
└── docker-compose.yml
```
