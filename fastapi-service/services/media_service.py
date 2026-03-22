"""
Service de traitement des fichiers médias.
- Validation du type MIME
- Sauvegarde sur disque
- Extraction de métadonnées (Pillow pour images, Mutagen pour audio)
- Génération de miniatures
"""

import os
import uuid
import aiofiles
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import UploadFile, HTTPException

# Pillow — traitement d'images
from PIL import Image, ExifTags
import io

# Mutagen — métadonnées audio
try:
    from mutagen import File as MutagenFile
    from mutagen.mp3  import MP3
    from mutagen.flac import FLAC
    from mutagen.mp4  import MP4
    MUTAGEN_DISPONIBLE = True
except ImportError:
    MUTAGEN_DISPONIBLE = False


# ── Configuration ─────────────────────────────────────────────────────────────

TYPES_AUDIO  = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac", "audio/mp4"}
TYPES_IMAGE  = {"image/jpeg", "image/png", "image/webp", "image/tiff", "image/gif"}

EXTENSIONS_AUTORISEES = {
    "audio/mpeg": ".mp3",
    "audio/wav":  ".wav",
    "audio/ogg":  ".ogg",
    "audio/flac": ".flac",
    "audio/aac":  ".aac",
    "audio/mp4":  ".m4a",
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "image/gif":  ".gif",
}

TAILLE_MINI_PX = int(os.getenv("MINIATURE_TAILLE", "400"))
QUALITE_JPEG   = int(os.getenv("JPEG_QUALITY", "85"))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _formater_duree(secondes: float) -> str:
    """Convertir des secondes en format mm:ss."""
    s = int(secondes)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _dossier_upload(type_media: str) -> Path:
    """Retourner le dossier de stockage selon le type."""
    base = Path(os.getenv("UPLOAD_DIR", "./uploads"))
    sous = "audio" if type_media in TYPES_AUDIO else "images"
    dossier = base / sous
    dossier.mkdir(parents=True, exist_ok=True)
    return dossier


def _dossier_miniatures() -> Path:
    """Dossier de stockage des miniatures."""
    d = Path(os.getenv("UPLOAD_DIR", "./uploads")) / "miniatures"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Extraction de métadonnées ─────────────────────────────────────────────────

def extraire_metadonnees_image(contenu: bytes, type_mime: str) -> dict:
    """Extraire les métadonnées d'une image avec Pillow."""
    try:
        with Image.open(io.BytesIO(contenu)) as img:
            meta = {
                "largeur":  img.width,
                "hauteur":  img.height,
                "format":   img.format,
                "mode":     img.mode,
                "taille_octets": len(contenu)
            }

            # Lire les données EXIF si disponibles
            exif_brut = img._getexif() if hasattr(img, "_getexif") and img._getexif() else {}
            if exif_brut:
                exif = {}
                for tag_id, valeur in exif_brut.items():
                    tag_nom = ExifTags.TAGS.get(tag_id, str(tag_id))
                    # Ne conserver que les valeurs sérialisables
                    if isinstance(valeur, (str, int, float, tuple)):
                        exif[tag_nom] = valeur
                meta["exif"] = exif

            return meta
    except Exception as e:
        return {"erreur": f"Impossible d'extraire les métadonnées : {str(e)}"}


def extraire_metadonnees_audio(chemin: str) -> dict:
    """Extraire les métadonnées d'un fichier audio avec Mutagen."""
    if not MUTAGEN_DISPONIBLE:
        return {"note": "Mutagen non disponible — pip install mutagen"}

    try:
        audio = MutagenFile(chemin)
        if audio is None:
            return {}

        meta: dict = {}

        # Durée
        if hasattr(audio.info, "length"):
            meta["duree_secondes"] = round(audio.info.length, 2)
            meta["duree_formatee"] = _formater_duree(audio.info.length)

        # Bitrate
        if hasattr(audio.info, "bitrate"):
            meta["bitrate_kbps"] = audio.info.bitrate // 1000

        # Fréquence d'échantillonnage
        if hasattr(audio.info, "sample_rate"):
            meta["frequence_hz"] = audio.info.sample_rate

        # Tags ID3 / Vorbis
        tags_communs = {
            "TIT2": "titre",   "©nam": "titre",   "TITLE": "titre",
            "TPE1": "artiste", "©ART": "artiste",  "ARTIST": "artiste",
            "TALB": "album",   "©alb": "album",    "ALBUM": "album",
            "TCON": "genre",   "©gen": "genre",    "GENRE": "genre",
            "TDRC": "annee",   "©day": "annee",    "DATE": "annee",
        }

        if audio.tags:
            for cle_tag, cle_meta in tags_communs.items():
                if cle_tag in audio.tags and cle_meta not in meta:
                    valeur = audio.tags[cle_tag]
                    if isinstance(valeur, list):
                        valeur = valeur[0]
                    meta[cle_meta] = str(valeur)

        return meta

    except Exception as e:
        return {"erreur": f"Impossible de lire les métadonnées audio : {str(e)}"}


# ── Génération de miniatures ──────────────────────────────────────────────────

def generer_miniature(contenu: bytes, identifiant: str) -> Optional[str]:
    """
    Générer une miniature carrée à partir d'une image.
    Retourne le nom du fichier miniature ou None en cas d'erreur.
    """
    try:
        with Image.open(io.BytesIO(contenu)) as img:
            img = img.convert("RGB")

            # Recadrage centré pour obtenir un carré
            largeur, hauteur = img.size
            cote = min(largeur, hauteur)
            gauche = (largeur - cote) // 2
            haut   = (hauteur - cote) // 2
            img = img.crop((gauche, haut, gauche + cote, haut + cote))

            img.thumbnail((TAILLE_MINI_PX, TAILLE_MINI_PX), Image.LANCZOS)

            nom_mini = f"mini_{identifiant}.jpg"
            chemin_mini = _dossier_miniatures() / nom_mini

            img.save(str(chemin_mini), "JPEG", quality=QUALITE_JPEG, optimize=True)
            return nom_mini

    except Exception as e:
        print(f"[Media] Erreur génération miniature : {e}")
        return None


# ── Sauvegarde principale ─────────────────────────────────────────────────────

async def sauvegarder_fichier(fichier: UploadFile) -> dict:
    """
    Valider, sauvegarder et traiter un fichier uploadé.

    Retourne un dict avec identifiant, chemins, et métadonnées.
    """
    type_mime = fichier.content_type or ""

    # Valider le type
    if type_mime not in TYPES_AUDIO and type_mime not in TYPES_IMAGE:
        raise HTTPException(
            status_code=415,
            detail=f"Type de fichier non supporté : {type_mime}. "
                   f"Acceptés : audio (mp3, wav, flac) et images (jpg, png, webp)."
        )

    # Lire le contenu
    contenu = await fichier.read()

    taille_max = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
    if len(contenu) > taille_max:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop volumineux. Limite : {os.getenv('MAX_UPLOAD_MB', '100')} Mo."
        )

    # Générer un identifiant unique
    identifiant = str(uuid.uuid4())
    extension   = EXTENSIONS_AUTORISEES.get(type_mime, "")
    nom_fichier = f"{identifiant}{extension}"

    # Déterminer le dossier cible
    est_audio = type_mime in TYPES_AUDIO
    dossier   = _dossier_upload(type_mime)
    chemin    = dossier / nom_fichier

    # Écrire sur disque de manière asynchrone
    async with aiofiles.open(str(chemin), "wb") as f:
        await f.write(contenu)

    # Extraire les métadonnées
    metadonnees = {}
    nom_miniature = None

    if est_audio:
        metadonnees = extraire_metadonnees_audio(str(chemin))
    else:
        metadonnees = extraire_metadonnees_image(contenu, type_mime)
        nom_miniature = generer_miniature(contenu, identifiant)

    return {
        "identifiant":   identifiant,
        "nom_original":  fichier.filename,
        "nom_fichier":   nom_fichier,
        "type_media":    "audio" if est_audio else "image",
        "type_mime":     type_mime,
        "taille_octets": len(contenu),
        "chemin":        str(chemin),
        "miniature":     nom_miniature,
        "metadonnees":   metadonnees,
        "cree_le":       datetime.utcnow().isoformat()
    }


async def supprimer_fichier(identifiant: str) -> bool:
    """Supprimer un fichier et sa miniature associée."""
    base = Path(os.getenv("UPLOAD_DIR", "./uploads"))
    supprime = False

    for sous_dossier in ["audio", "images"]:
        for ext in EXTENSIONS_AUTORISEES.values():
            chemin = base / sous_dossier / f"{identifiant}{ext}"
            if chemin.exists():
                chemin.unlink()
                supprime = True

    # Supprimer la miniature si elle existe
    mini = base / "miniatures" / f"mini_{identifiant}.jpg"
    if mini.exists():
        mini.unlink()

    return supprime
