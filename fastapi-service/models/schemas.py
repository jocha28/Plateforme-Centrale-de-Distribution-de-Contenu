"""
Schémas Pydantic pour la validation des données du service FastAPI.
Pydantic v2 est utilisé ici (syntax model_config, field_validator).
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from enum import Enum


class TypeMedia(str, Enum):
    """Types de fichiers médias acceptés."""
    audio = "audio"
    image = "image"


class StatutTraitement(str, Enum):
    """Statut du traitement d'un fichier."""
    en_attente  = "en_attente"
    traitement  = "traitement"
    termine     = "termine"
    erreur      = "erreur"


# ── Réponses ──────────────────────────────────────────────────────────────────

class ReponseUpload(BaseModel):
    """Réponse renvoyée après un upload réussi."""
    succes: bool
    message: str
    identifiant: str          # UUID du fichier stocké
    nom_original: str
    type_media: TypeMedia
    taille_octets: int
    url_fichier: str
    url_miniature: Optional[str] = None
    metadonnees: Optional[dict] = None


class MetadonneesAudio(BaseModel):
    """Métadonnées extraites d'un fichier audio."""
    titre: Optional[str] = None
    artiste: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    annee: Optional[int] = None
    duree_secondes: Optional[float] = None
    duree_formatee: Optional[str] = None
    bitrate: Optional[int] = None      # en kbps
    frequence: Optional[int] = None    # en Hz
    codec: Optional[str] = None


class MetadonneesImage(BaseModel):
    """Métadonnées extraites d'un fichier image."""
    largeur: Optional[int] = None
    hauteur: Optional[int] = None
    format: Optional[str] = None
    mode: Optional[str] = None         # RGB, RGBA, L, etc.
    taille_octets: Optional[int] = None
    exif: Optional[dict] = None        # Données EXIF brutes


class ReponseSuppression(BaseModel):
    """Réponse après suppression d'un fichier."""
    succes: bool
    message: str
    identifiant: str


class ReponseErreur(BaseModel):
    """Format d'erreur standard."""
    succes: bool = False
    message: str
    detail: Optional[str] = None


class InfoFichier(BaseModel):
    """Informations sur un fichier stocké."""
    identifiant: str
    nom_original: str
    type_media: TypeMedia
    taille_octets: int
    url: str
    url_miniature: Optional[str] = None
    cree_le: str
