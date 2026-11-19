import { parseRecentTracks, coverFromImages, validCoverUrl } from '../domain/lastfm-parser.js';
import { ExternalServiceError, classifyLastfmError } from '../domain/errors.js';

/** Last.fm API adapter. Only the first track's artwork is enriched when needed. */
export function createLastfmClient({ request, apiKey }) {
  if (typeof request !== 'function') throw new TypeError('Last.fm: request ausente.');

  // No URL or URLSearchParams globals on Telegram Serverless.
  async function query(method, fields = {}) {
    if (!apiKey) throw new ExternalServiceError('invalid_key', 'API key não configurada');
    const params = [
      ['method', method],
      ...Object.entries(fields),
      ['api_key', apiKey],
      ['format', 'json'],
    ].map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');

    let response;
    try {
      response = await request('https://ws.audioscrobbler.com/2.0/?' + params);
    } catch {
      // Don't log the thrown request URL; it contains the API key.
      throw new ExternalServiceError('network', 'Falha de rede no Last.fm');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      const status = response?.status ?? null;
      const kind = !response?.ok ? (status === 429 ? 'rate_limited' : 'unavailable') : 'bad_response';
      throw new ExternalServiceError(kind, 'Last.fm retornou JSON inválido', { status });
    }

    if (payload && Object.hasOwn(payload, 'error')) {
      const apiCode = Number(payload.error);
      throw new ExternalServiceError(classifyLastfmError(apiCode, payload.message),
        `Last.fm error ${apiCode}`, { apiCode, status: response.status });
    }

    if (!response?.ok) {
      const status = response?.status ?? null;
      const kind = status === 429 ? 'rate_limited' : status === 400 ? 'invalid_request' : 'unavailable';
      throw new ExternalServiceError(kind, `Last.fm HTTP ${status}`, { status });
    }
    return { payload, status: response.status };
  }

  async function coverFor(track) {
    const existing = validCoverUrl(track?.image);
    if (existing) return existing;
    if (!track?.artist || !track?.title) return '';

    if (track.album) {
      try {
        const { payload } = await query('album.getInfo', {
          artist: track.artist, album: track.album, autocorrect: 1,
        });
        const albumCover = coverFromImages(payload?.album?.image);
        if (albumCover) return albumCover;
      } catch (error) {
        // An album not found in the catalogue isn't a network failure.
        if (!(error instanceof ExternalServiceError && error.apiCode === 6)) throw error;
      }
    }

    try {
      const { payload } = await query('track.getInfo', {
        artist: track.artist, track: track.title, autocorrect: 1,
      });
      return coverFromImages(payload?.track?.album?.image) ||
        coverFromImages(payload?.track?.image);
    } catch (error) {
      if (error instanceof ExternalServiceError && error.apiCode === 6) return '';
      throw error;
    }
  }

  return Object.freeze({
    async recent(username, limit = 5) {
      const n = Math.max(1, Math.min(10, Number(limit) || 5));
      const { payload, status } = await query('user.getRecentTracks', {
        user: username, limit: n,
      });
      try {
        return parseRecentTracks(payload);
      } catch {
        throw new ExternalServiceError('bad_response', 'Estrutura de faixas inválida no Last.fm', { status });
      }
    },
    coverFor,
  });
}
