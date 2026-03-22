"""
Routes FastAPI pour la gestion des fichiers médias.

Endpoints :
  POST /media/upload          → Uploader un fichier audio ou image
  GET  /media/stream/{id}     → Streamer un fichier audio
  GET  /media/image/{id}      → Servir une image
  GET  /media/miniature/{id}  → Servir une miniature
  GET  /media/metadata/{id}   → Extraire/retourner les métadonnées
  DELETE /media/{id}          → Supprimer un fichier (JWT requis)
"""

import os
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse, FileResponse
from jose import JWTError, jwt

from models.schemas import ReponseUpload, ReponseErreur, ReponseSuppression
from services.media_service import sauvegarder_fichier, supprimer_fichier, extraire_metadonnees_audio, extraire_metadonnees_image

router = APIRouter(prefix="/media", tags=["Médias"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
JWT_SECRET = os.getenv("JWT_SECRET", "secret")


# ── Authentification JWT (partagée avec Express) ──────────────────────────────

async def verifier_token_admin(authorization: Optional[str] = Header(None)):
    """Dépendance FastAPI : vérifier le JWT admin."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token JWT manquant. Header requis : Authorization: Bearer <token>"
        )

    token = authorization.split(" ")[1]

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Droits administrateur requis.")
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide ou expiré : {str(e)}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _trouver_fichier(identifiant: str) -> Optional[Path]:
    """Chercher un fichier par son UUID dans tous les sous-dossiers d'upload."""
    for sous_dossier in ["audio", "images"]:
        dossier = UPLOAD_DIR / sous_dossier
        if dossier.exists():
            for fichier in dossier.iterdir():
                if fichier.stem == identifiant:
                    return fichier
    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=ReponseUpload,
    summary="Uploader un fichier audio ou image",
    description="Accepte les formats audio (mp3, wav, flac, ogg) et image (jpg, png, webp). Génère une miniature pour les images."
)
async def uploader_fichier(
    fichier: UploadFile = File(..., description="Fichier audio ou image à uploader"),
    admin=Depends(verifier_token_admin)
):
    resultat = await sauvegarder_fichier(fichier)

    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    type_media = resultat["type_media"]

    url_fichier = (
        f"{base_url}/media/stream/{resultat['identifiant']}"
        if type_media == "audio"
        else f"{base_url}/media/image/{resultat['identifiant']}"
    )

    url_miniature = None
    if resultat.get("miniature"):
        url_miniature = f"{base_url}/media/miniature/{resultat['identifiant']}"

    return ReponseUpload(
        succes=True,
        message="Fichier uploadé et traité avec succès.",
        identifiant=resultat["identifiant"],
        nom_original=resultat["nom_original"],
        type_media=type_media,
        taille_octets=resultat["taille_octets"],
        url_fichier=url_fichier,
        url_miniature=url_miniature,
        metadonnees=resultat.get("metadonnees")
    )


@router.get(
    "/stream/{identifiant}",
    summary="Streamer un fichier audio",
    description="Retourne le fichier audio en streaming. Supporte le header Range pour la lecture partielle (HTML audio player)."
)
async def streamer_audio(identifiant: str):
    fichier = _trouver_fichier(identifiant)

    if not fichier or not fichier.exists():
        raise HTTPException(status_code=404, detail=f"Fichier audio introuvable : {identifiant}")

    type_mime = mimetypes.guess_type(str(fichier))[0] or "audio/mpeg"
    taille = fichier.stat().st_size

    def generateur_stream():
        with open(str(fichier), "rb") as f:
            while chunk := f.read(64 * 1024):  # Chunks de 64 Ko
                yield chunk

    return StreamingResponse(
        generateur_stream(),
        media_type=type_mime,
        headers={
            "Content-Length": str(taille),
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'inline; filename="{fichier.name}"'
        }
    )


@router.get(
    "/image/{identifiant}",
    summary="Servir une image",
    description="Retourne l'image originale. Les images sont servies avec mise en cache (1 heure)."
)
async def servir_image(identifiant: str):
    fichier = _trouver_fichier(identifiant)

    if not fichier or not fichier.exists():
        raise HTTPException(status_code=404, detail=f"Image introuvable : {identifiant}")

    type_mime = mimetypes.guess_type(str(fichier))[0] or "image/jpeg"

    return FileResponse(
        str(fichier),
        media_type=type_mime,
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": f'inline; filename="{fichier.name}"'
        }
    )


@router.get(
    "/miniature/{identifiant}",
    summary="Servir la miniature d'une image",
    description="Retourne la miniature 400x400 générée automatiquement lors de l'upload."
)
async def servir_miniature(identifiant: str):
    chemin_mini = UPLOAD_DIR / "miniatures" / f"mini_{identifiant}.jpg"

    if not chemin_mini.exists():
        # Fallback : servir l'image originale si pas de miniature
        fichier = _trouver_fichier(identifiant)
        if fichier and fichier.exists():
            return FileResponse(str(fichier), media_type="image/jpeg")
        raise HTTPException(status_code=404, detail=f"Miniature introuvable : {identifiant}")

    return FileResponse(
        str(chemin_mini),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"}  # 24h
    )


@router.get(
    "/metadata/{identifiant}",
    summary="Obtenir les métadonnées d'un fichier",
    description="Extrait et retourne les métadonnées : dimensions pour les images, durée/bitrate/tags pour l'audio."
)
async def obtenir_metadonnees(identifiant: str):
    fichier = _trouver_fichier(identifiant)

    if not fichier or not fichier.exists():
        raise HTTPException(status_code=404, detail=f"Fichier introuvable : {identifiant}")

    type_mime = mimetypes.guess_type(str(fichier))[0] or ""

    if type_mime.startswith("audio/"):
        meta = extraire_metadonnees_audio(str(fichier))
        type_media = "audio"
    else:
        with open(str(fichier), "rb") as f:
            meta = extraire_metadonnees_image(f.read(), type_mime)
        type_media = "image"

    return {
        "succes": True,
        "identifiant": identifiant,
        "type_media": type_media,
        "type_mime": type_mime,
        "nom_fichier": fichier.name,
        "taille_octets": fichier.stat().st_size,
        "metadonnees": meta
    }


@router.delete(
    "/{identifiant}",
    response_model=ReponseSuppression,
    summary="Supprimer un fichier média",
    description="Supprime le fichier et sa miniature. Requiert un token JWT administrateur."
)
async def supprimer_media(
    identifiant: str,
    admin=Depends(verifier_token_admin)
):
    supprime = await supprimer_fichier(identifiant)

    if not supprime:
        raise HTTPException(status_code=404, detail=f"Fichier introuvable : {identifiant}")

    return ReponseSuppression(
        succes=True,
        message="Fichier supprimé avec succès.",
        identifiant=identifiant
    )
