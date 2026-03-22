"""
Service FastAPI — Gestion des fichiers médias
Plateforme Centrale de Distribution de Contenu

Démarrage :
  uvicorn main:app --reload --port 8000

Documentation interactive :
  http://localhost:8000/docs   (Swagger UI)
  http://localhost:8000/redoc  (ReDoc)
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from routes.media import router as router_media


# ── Initialisation au démarrage ───────────────────────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    """Initialiser les ressources au démarrage et les libérer à l'arrêt."""
    # Créer les dossiers d'upload s'ils n'existent pas
    upload_dir = Path(os.getenv("UPLOAD_DIR", "./uploads"))
    for sous_dossier in ["audio", "images", "miniatures", "temp"]:
        (upload_dir / sous_dossier).mkdir(parents=True, exist_ok=True)

    print(f"\n✓ Dossiers médias initialisés dans : {upload_dir.resolve()}")
    print(f"✓ Service FastAPI Médias prêt\n")

    yield

    print("\nArrêt du service FastAPI Médias...")


# ── Application FastAPI ───────────────────────────────────────────────────────

app = FastAPI(
    title="Plateforme Contenu — Service Médias",
    description="""
## Service de gestion des fichiers médias

Ce microservice gère l'upload, le streaming et le traitement des fichiers médias
pour la Plateforme Centrale de Distribution de Contenu.

### Fonctionnalités
- **Upload** : audio (mp3, wav, flac, ogg) et images (jpg, png, webp)
- **Streaming** : lecture audio en continu avec support du header Range
- **Miniatures** : génération automatique de miniatures 400×400 pour les images
- **Métadonnées** : extraction des tags ID3/Vorbis (audio) et EXIF (images)

### Authentification
Les routes d'écriture (upload, suppression) requièrent un token JWT admin.
Le même JWT généré par l'API Express est accepté ici.

```
Authorization: Bearer <token_jwt>
```
    """,
    version="1.0.0",
    contact={
        "name": "jocha28",
        "url": "https://github.com/jocha28/Plateforme-Centrale-de-Distribution-de-Contenu"
    },
    lifespan=lifespan
)


# ── Middlewares ───────────────────────────────────────────────────────────────

origines_autorisees = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origines_autorisees],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)


# ── Fichiers statiques (accès direct aux uploads) ─────────────────────────────

upload_dir = Path(os.getenv("UPLOAD_DIR", "./uploads"))
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


# ── Inclusion des routes ──────────────────────────────────────────────────────

app.include_router(router_media)


# ── Endpoints de base ─────────────────────────────────────────────────────────

@app.get("/", tags=["Informations"], summary="Index du service")
async def index():
    """Informations générales sur le service."""
    return {
        "service": "Plateforme Contenu — Service Médias (FastAPI)",
        "version": "1.0.0",
        "statut": "en ligne",
        "endpoints": {
            "documentation": "/docs",
            "redoc": "/redoc",
            "sante": "/health",
            "upload": "POST /media/upload",
            "stream_audio": "GET /media/stream/{id}",
            "image": "GET /media/image/{id}",
            "miniature": "GET /media/miniature/{id}",
            "metadonnees": "GET /media/metadata/{id}",
            "supprimer": "DELETE /media/{id}"
        },
        "note": "Les routes d'écriture nécessitent un token JWT admin (partagé avec l'API Express)."
    }


@app.get("/health", tags=["Informations"], summary="Vérifier l'état du service")
async def sante():
    """Vérification de santé du service."""
    upload_dir = Path(os.getenv("UPLOAD_DIR", "./uploads"))

    # Calculer l'espace utilisé
    taille_totale = sum(f.stat().st_size for f in upload_dir.rglob("*") if f.is_file())

    return {
        "statut": "ok",
        "service": "FastAPI Service Médias",
        "version": "1.0.0",
        "stockage": {
            "dossier": str(upload_dir.resolve()),
            "taille_mo": round(taille_totale / (1024 * 1024), 2)
        }
    }


# ── Gestionnaire d'erreurs global ─────────────────────────────────────────────

@app.exception_handler(404)
async def gestionnaire_404(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "succes": False,
            "message": f"Route introuvable : {request.method} {request.url.path}",
            "aide": "Consulter /docs pour la liste des endpoints disponibles."
        }
    )


@app.exception_handler(500)
async def gestionnaire_500(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "succes": False,
            "message": "Erreur interne du service médias.",
            "detail": str(exc) if os.getenv("ENVIRONMENT") != "production" else None
        }
    )


# ── Démarrage direct ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("ENVIRONMENT") == "development",
        log_level="info"
    )
