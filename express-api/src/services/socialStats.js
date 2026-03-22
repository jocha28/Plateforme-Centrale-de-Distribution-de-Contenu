/**
 * Service de récupération des statistiques réseaux sociaux.
 *
 * Consommation d'API tierces (Partie 2 du cours) :
 * - YouTube Data API v3 (si clé disponible)
 * - Instagram Basic Display API (si token disponible)
 * - SoundCloud API (si clé disponible)
 *
 * Sans clés d'API : retourne des données simulées réalistes.
 */

const axios = require('axios');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formater un grand nombre en format lisible (ex: 12345 → "12.3K")
 */
function formaterNombre(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── YouTube Data API v3 ───────────────────────────────────────────────────────

/**
 * Récupérer les statistiques d'une vidéo YouTube via son ID.
 * Documentation : https://developers.google.com/youtube/v3/docs/videos/list
 *
 * @param {string} videoId  — ID de la vidéo (ex: "dQw4w9WgXcQ")
 * @returns {object} statistiques de la vidéo
 */
async function obtenirStatsYoutube(videoId) {
  const cle = process.env.YOUTUBE_API_KEY;

  if (!cle) {
    console.warn('[YouTube] Clé API manquante — données simulées utilisées.');
    return simulerStatsYoutube(videoId);
  }

  try {
    const reponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'statistics,snippet',
        id: videoId,
        key: cle
      },
      timeout: 5000
    });

    const items = reponse.data.items;
    if (!items || items.length === 0) {
      return { erreur: 'Vidéo introuvable sur YouTube.', videoId };
    }

    const video = items[0];
    const stats = video.statistics;

    return {
      source: 'youtube',
      videoId,
      titre: video.snippet.title,
      chaine: video.snippet.channelTitle,
      datePublication: video.snippet.publishedAt,
      statistiques: {
        vues:         parseInt(stats.viewCount   || '0', 10),
        likes:        parseInt(stats.likeCount   || '0', 10),
        commentaires: parseInt(stats.commentCount || '0', 10),
        formateVues:  formaterNombre(parseInt(stats.viewCount || '0', 10))
      },
      url: `https://www.youtube.com/watch?v=${videoId}`,
      recupereA: new Date().toISOString()
    };

  } catch (err) {
    console.error('[YouTube] Erreur API :', err.response?.data?.error?.message || err.message);

    if (err.response?.status === 403) {
      return { erreur: 'Quota YouTube API dépassé ou clé invalide.', videoId };
    }
    return simulerStatsYoutube(videoId);
  }
}

/**
 * Données YouTube simulées (utilisées quand pas de clé API).
 */
function simulerStatsYoutube(videoId) {
  // Générer des stats cohérentes mais pseudo-aléatoires à partir de l'ID
  const graine = videoId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const vues   = 1000 + (graine * 137) % 50000;
  const likes  = Math.floor(vues * 0.04);
  const comms  = Math.floor(vues * 0.006);

  return {
    source: 'simulation',
    videoId,
    titre: `Vidéo ${videoId}`,
    statistiques: {
      vues,
      likes,
      commentaires: comms,
      formateVues: formaterNombre(vues)
    },
    url: `https://www.youtube.com/watch?v=${videoId}`,
    note: 'Statistiques simulées — configurer YOUTUBE_API_KEY dans .env pour les vraies données.',
    recupereA: new Date().toISOString()
  };
}

// ── SoundCloud API ────────────────────────────────────────────────────────────

/**
 * Récupérer les statistiques d'un morceau SoundCloud.
 * @param {string} trackUrl — URL ou slug du morceau
 */
async function obtenirStatsSoundcloud(trackUrl) {
  const cleClient = process.env.SOUNDCLOUD_CLIENT_ID;

  if (!cleClient) {
    return simulerStatsSoundcloud(trackUrl);
  }

  try {
    const reponse = await axios.get('https://api.soundcloud.com/resolve', {
      params: { url: trackUrl, client_id: cleClient },
      timeout: 5000
    });

    const track = reponse.data;
    return {
      source: 'soundcloud',
      trackId: track.id,
      titre: track.title,
      statistiques: {
        ecoutes:      track.playback_count || 0,
        likes:        track.likes_count    || 0,
        telechargements: track.download_count || 0,
        formateEcoutes: formaterNombre(track.playback_count || 0)
      },
      url: track.permalink_url,
      recupereA: new Date().toISOString()
    };
  } catch (err) {
    console.error('[SoundCloud] Erreur API :', err.message);
    return simulerStatsSoundcloud(trackUrl);
  }
}

function simulerStatsSoundcloud(trackUrl) {
  const graine = trackUrl.length * 97;
  const ecoutes = 500 + (graine * 73) % 20000;
  return {
    source: 'simulation',
    trackUrl,
    statistiques: {
      ecoutes,
      likes: Math.floor(ecoutes * 0.05),
      telechargements: Math.floor(ecoutes * 0.02),
      formateEcoutes: formaterNombre(ecoutes)
    },
    note: 'Statistiques simulées — configurer SOUNDCLOUD_CLIENT_ID dans .env pour les vraies données.',
    recupereA: new Date().toISOString()
  };
}

// ── Agrégateur — stats toutes plateformes ─────────────────────────────────────

/**
 * Agréger les statistiques de plusieurs plateformes pour une œuvre donnée.
 * @param {object} liens — { youtubeId?, soundcloudUrl? }
 */
async function obtenirStatsAgregeees(liens = {}) {
  const promises = [];
  const labels   = [];

  if (liens.youtubeId) {
    promises.push(obtenirStatsYoutube(liens.youtubeId));
    labels.push('youtube');
  }

  if (liens.soundcloudUrl) {
    promises.push(obtenirStatsSoundcloud(liens.soundcloudUrl));
    labels.push('soundcloud');
  }

  if (promises.length === 0) {
    return { message: 'Aucun lien de plateforme fourni.', stats: {} };
  }

  const resultats = await Promise.allSettled(promises);
  const stats = {};

  resultats.forEach((resultat, index) => {
    stats[labels[index]] = resultat.status === 'fulfilled'
      ? resultat.value
      : { erreur: resultat.reason?.message || 'Erreur inconnue' };
  });

  // Totaux consolidés
  const totalVues = Object.values(stats).reduce((acc, s) => {
    return acc + (s.statistiques?.vues || s.statistiques?.ecoutes || 0);
  }, 0);

  const totalLikes = Object.values(stats).reduce((acc, s) => {
    return acc + (s.statistiques?.likes || 0);
  }, 0);

  return {
    stats,
    consolide: {
      totalVues,
      totalLikes,
      formateVues:  formaterNombre(totalVues),
      formateLikes: formaterNombre(totalLikes)
    },
    recupereA: new Date().toISOString()
  };
}

module.exports = {
  obtenirStatsYoutube,
  obtenirStatsSoundcloud,
  obtenirStatsAgregeees,
  formaterNombre
};
