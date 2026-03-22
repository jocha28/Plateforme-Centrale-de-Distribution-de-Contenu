"""
Configuration globale des tests FastAPI (pytest).
Fournit les fixtures partagées : client HTTP, token JWT, fichiers de test.
"""

import os
import io
import pytest
import tempfile
import shutil
import jwt
from httpx import AsyncClient, ASGITransport

# Variables d'environnement de test (avant import de l'app)
os.environ["JWT_SECRET"]      = "secret_test_pytest_fastapi_2024"
os.environ["UPLOAD_DIR"]      = tempfile.mkdtemp(prefix="fastapi_test_uploads_")
os.environ["MAX_UPLOAD_MB"]   = "10"
os.environ["ENVIRONMENT"]     = "test"
os.environ["MINIATURE_TAILLE"] = "100"

from main import app


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def token_admin():
    """Générer un token JWT admin valide pour les tests."""
    return jwt.encode(
        {"id": 1, "username": "admin_test", "role": "admin"},
        os.environ["JWT_SECRET"],
        algorithm="HS256"
    )


@pytest.fixture(scope="session")
def token_sans_role():
    """Token JWT sans rôle admin."""
    return jwt.encode(
        {"id": 99, "username": "user_lambda"},
        os.environ["JWT_SECRET"],
        algorithm="HS256"
    )




@pytest.fixture
def fichier_audio_mp3():
    """
    Simuler un fichier MP3 minimal valide.
    Header ID3 + frame MPEG minimale pour passer la validation MIME.
    """
    # Header ID3v2 minimal (10 octets) + données aléatoires
    contenu = (
        b"ID3"           # Marqueur ID3
        b"\x04\x00"      # Version 2.4, sans flags
        b"\x00"          # Flags
        b"\x00\x00\x00\x00"  # Taille 0
        + b"\xff\xfb\x90\x00"  # Frame MPEG Layer 3
        + b"\x00" * 100  # Données
    )
    return ("test_audio.mp3", io.BytesIO(contenu), "audio/mpeg")


@pytest.fixture
def fichier_image_jpg():
    """Créer une vraie image JPEG minimale avec Pillow."""
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", (200, 200), color=(255, 100, 50))
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return ("test_image.jpg", buf, "image/jpeg")


@pytest.fixture
def fichier_image_png():
    """Créer une vraie image PNG minimale avec Pillow."""
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGBA", (150, 150), color=(100, 200, 255, 255))
    img.save(buf, format="PNG")
    buf.seek(0)
    return ("test_image.png", buf, "image/png")


@pytest.fixture
def fichier_invalide():
    """Fichier avec un type MIME non supporté."""
    return ("script.exe", io.BytesIO(b"MZ\x90\x00"), "application/octet-stream")


@pytest.fixture(scope="session", autouse=True)
def nettoyer_uploads():
    """Supprimer le dossier d'uploads temporaire après tous les tests."""
    yield
    dossier = os.environ.get("UPLOAD_DIR", "")
    if dossier and os.path.exists(dossier) and "fastapi_test_uploads_" in dossier:
        shutil.rmtree(dossier, ignore_errors=True)
