"""
Tests — Service Médias FastAPI
Routes : POST /media/upload
         GET  /media/stream/{id}
         GET  /media/image/{id}
         GET  /media/miniature/{id}
         GET  /media/metadata/{id}
         DELETE /media/{id}
"""

import os
import pytest
from httpx import AsyncClient, ASGITransport
from main import app

BASE_URL = "http://test"


# ── Helper pour créer un client HTTP de test ──────────────────────────────────

def client_test():
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL)


# ── Tests : Index et santé ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_index():
    """✓ GET / — retourne les informations du service."""
    async with client_test() as c:
        res = await c.get("/")

    assert res.status_code == 200
    data = res.json()
    assert "service" in data
    assert "endpoints" in data
    assert "FastAPI" in data["service"]


@pytest.mark.asyncio
async def test_sante():
    """✓ GET /health — retourne statut ok."""
    async with client_test() as c:
        res = await c.get("/health")

    assert res.status_code == 200
    data = res.json()
    assert data["statut"] == "ok"
    assert "stockage" in data


# ── Tests : Upload ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_image_jpg(fichier_image_jpg, token_admin):
    """✓ Upload d'une image JPEG valide avec token admin."""
    nom, buf, mime = fichier_image_jpg
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    assert res.status_code == 200
    data = res.json()
    assert data["succes"] is True
    assert data["type_media"] == "image"
    assert "identifiant" in data
    assert "url_fichier" in data
    assert len(data["identifiant"]) == 36  # UUID format


@pytest.mark.asyncio
async def test_upload_image_png(fichier_image_png, token_admin):
    """✓ Upload d'une image PNG valide."""
    nom, buf, mime = fichier_image_png
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    assert res.status_code == 200
    assert res.json()["type_media"] == "image"


@pytest.mark.asyncio
async def test_upload_retourne_metadonnees_image(fichier_image_jpg, token_admin):
    """✓ L'upload d'une image retourne les métadonnées (dimensions)."""
    nom, buf, mime = fichier_image_jpg
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    data = res.json()
    assert data["metadonnees"] is not None
    assert "largeur" in data["metadonnees"]
    assert "hauteur" in data["metadonnees"]
    assert data["metadonnees"]["largeur"] == 200
    assert data["metadonnees"]["hauteur"] == 200


@pytest.mark.asyncio
async def test_upload_retourne_url_miniature(fichier_image_jpg, token_admin):
    """✓ L'upload d'une image génère une miniature."""
    nom, buf, mime = fichier_image_jpg
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    data = res.json()
    assert data.get("url_miniature") is not None
    assert "miniature" in data["url_miniature"]


@pytest.mark.asyncio
async def test_upload_sans_token(fichier_image_jpg):
    """✗ Upload refusé sans token JWT."""
    nom, buf, mime = fichier_image_jpg
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)}
        )

    assert res.status_code == 401


@pytest.mark.asyncio
async def test_upload_token_sans_role_admin(fichier_image_jpg, token_sans_role):
    """✗ Upload refusé pour un token sans rôle admin."""
    nom, buf, mime = fichier_image_jpg
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_sans_role}"}
        )

    assert res.status_code == 403


@pytest.mark.asyncio
async def test_upload_type_invalide(fichier_invalide, token_admin):
    """✗ Upload refusé pour un type MIME non supporté."""
    nom, buf, mime = fichier_invalide
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    assert res.status_code == 415


@pytest.mark.asyncio
async def test_upload_token_invalide(fichier_image_jpg):
    """✗ Upload refusé avec token JWT falsifié."""
    nom, buf, mime = fichier_image_jpg
    async with client_test() as c:
        res = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": "Bearer token.faux.invalide"}
        )

    assert res.status_code == 401


# ── Tests : Servir les images ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_servir_image_existante(fichier_image_jpg, token_admin):
    """✓ GET /media/image/{id} — retourne l'image uploadée."""
    nom, buf, mime = fichier_image_jpg

    async with client_test() as c:
        upload = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        identifiant = upload.json()["identifiant"]

        res = await c.get(f"/media/image/{identifiant}")

    assert res.status_code == 200
    assert "image/" in res.headers["content-type"]


@pytest.mark.asyncio
async def test_servir_image_inexistante():
    """✗ GET /media/image/{id} — 404 pour un identifiant inexistant."""
    async with client_test() as c:
        res = await c.get("/media/image/00000000-0000-0000-0000-000000000000")

    assert res.status_code == 404


# ── Tests : Miniatures ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_servir_miniature_existante(fichier_image_jpg, token_admin):
    """✓ GET /media/miniature/{id} — retourne la miniature."""
    nom, buf, mime = fichier_image_jpg

    async with client_test() as c:
        upload = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        identifiant = upload.json()["identifiant"]

        res = await c.get(f"/media/miniature/{identifiant}")

    assert res.status_code == 200
    assert "image/jpeg" in res.headers["content-type"]


@pytest.mark.asyncio
async def test_servir_miniature_inexistante():
    """✗ GET /media/miniature/{id} — 404 pour un identifiant inexistant."""
    async with client_test() as c:
        res = await c.get("/media/miniature/00000000-0000-0000-0000-000000000099")

    assert res.status_code == 404


# ── Tests : Métadonnées ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_obtenir_metadonnees_image(fichier_image_png, token_admin):
    """✓ GET /media/metadata/{id} — retourne les métadonnées d'une image."""
    nom, buf, mime = fichier_image_png

    async with client_test() as c:
        upload = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        identifiant = upload.json()["identifiant"]

        res = await c.get(f"/media/metadata/{identifiant}")

    assert res.status_code == 200
    data = res.json()
    assert data["succes"] is True
    assert data["type_media"] == "image"
    assert "metadonnees" in data
    assert data["metadonnees"]["largeur"] == 150


@pytest.mark.asyncio
async def test_metadonnees_fichier_inexistant():
    """✗ GET /media/metadata/{id} — 404 pour un fichier inexistant."""
    async with client_test() as c:
        res = await c.get("/media/metadata/00000000-0000-0000-0000-000000000042")

    assert res.status_code == 404


# ── Tests : Suppression ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_supprimer_fichier_existant(fichier_image_jpg, token_admin):
    """✓ DELETE /media/{id} — supprime un fichier existant."""
    nom, buf, mime = fichier_image_jpg

    async with client_test() as c:
        upload = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        identifiant = upload.json()["identifiant"]

        res = await c.delete(
            f"/media/{identifiant}",
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    assert res.status_code == 200
    data = res.json()
    assert data["succes"] is True
    assert data["identifiant"] == identifiant


@pytest.mark.asyncio
async def test_suppression_rend_image_inaccessible(fichier_image_png, token_admin):
    """✓ Après suppression, l'image retourne 404."""
    nom, buf, mime = fichier_image_png

    async with client_test() as c:
        upload = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        identifiant = upload.json()["identifiant"]

        await c.delete(
            f"/media/{identifiant}",
            headers={"Authorization": f"Bearer {token_admin}"}
        )

        res = await c.get(f"/media/image/{identifiant}")

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_supprimer_sans_token(fichier_image_jpg, token_admin):
    """✗ DELETE /media/{id} — refusé sans token."""
    nom, buf, mime = fichier_image_jpg

    async with client_test() as c:
        upload = await c.post(
            "/media/upload",
            files={"fichier": (nom, buf, mime)},
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        identifiant = upload.json()["identifiant"]

        res = await c.delete(f"/media/{identifiant}")

    assert res.status_code == 401


@pytest.mark.asyncio
async def test_supprimer_fichier_inexistant(token_admin):
    """✗ DELETE /media/{id} — 404 pour un identifiant inexistant."""
    async with client_test() as c:
        res = await c.delete(
            "/media/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {token_admin}"}
        )

    assert res.status_code == 404


# ── Tests : Route inexistante ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_route_inexistante():
    """✗ Retourne 404 pour une route inconnue."""
    async with client_test() as c:
        res = await c.get("/api/v1/nonexistant")

    assert res.status_code == 404
    data = res.json()
    assert data["succes"] is False
