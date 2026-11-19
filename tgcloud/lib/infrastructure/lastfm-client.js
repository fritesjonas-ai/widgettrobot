import { parseRecentTracks, coverFromImages, validCoverUrl } from '../domain/lastfm-parser.js';
import { parseRanking, parseUserInfo, parseLovedTracks, parseSimilarTracks, parseSimilarArtists } from '../domain/lastfm-insights.js';
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
    async top(username, kind = 'tracks', period = '7day', limit = 5) {
      const methods = { tracks: ['user.getTopTracks','toptracks','track'],
        albums: ['user.getTopAlbums','topalbums','album'],
        artists: ['user.getTopArtists','topartists','artist'] };
      if (!Object.hasOwn(methods,kind) || !['overall','7day','1month','3month','6month','12month'].includes(period)) {
        throw new TypeError('Ranking: filtro inválido');
      }
      const [method, root, item] = methods[kind];
      const { payload } = await query(method, { user:username, period, limit:Math.max(1,Math.min(50,Number(limit)||5)) });
      return parseRanking(payload,root,item,kind);
    },
    async info(username) {
      const { payload } = await query('user.getInfo', {user:username});
      return parseUserInfo(payload);
    },
    async loved(username, limit = 5) {
      const { payload } = await query('user.getLovedTracks', {user:username,limit:Math.max(1,Math.min(10,Number(limit)||5))});
      return parseLovedTracks(payload);
    },
    async similar(artist, title, limit = 5) {
      if (!artist || !title) return { kind:'tracks', items:[] };
      let items = [];
      try {
        const { payload } = await query('track.getSimilar', {artist,track:title,autocorrect:1,limit:Math.max(1,Math.min(10,Number(limit)||5))});
        items = parseSimilarTracks(payload);
      } catch (error) {
        if (!(error instanceof ExternalServiceError) || ![6,7].includes(error.apiCode)) throw error;
      }
      if (items.length) return {kind:'tracks',items};
      // Some tracks lack a similarity model. Fall back to artist-level similarity.
      try {
        const { payload } = await query('artist.getSimilar', {artist,autocorrect:1,limit:Math.max(1,Math.min(10,Number(limit)||5))});
        return {kind:'artists',items:parseSimilarArtists(payload)};
      } catch (error) {
        if (error instanceof ExternalServiceError && [6,7].includes(error.apiCode)) return {kind:'artists',items:[]};
        throw error;
      }
    },
    async albumInfo(artist, album) {
      if (!artist || !album) return null;
      try {
        const { payload } = await query('album.getInfo', { artist, album, autocorrect:1 });
        const data = payload?.album;
        if (!data || typeof data !== 'object') return null;
        const tracks = data?.tracks?.track;
        const list = Array.isArray(tracks) ? tracks : tracks && typeof tracks === 'object' ? [tracks] : [];
        return {
          title: String(data.name || album).slice(0,130),
          artist: String(typeof data.artist === 'string' ? data.artist : data.artist?.name || artist).slice(0,100),
          image: coverFromImages(data.image),
          tracks: list.slice(0,5).map(x=>String(x?.name||'').slice(0,120)).filter(Boolean),
          listeners: Number(data.listeners)||0,
        };
      } catch(error) {
        if (error instanceof ExternalServiceError && error.apiCode===6) return null;
        throw error;
      }
    },
    async search(term, limit=5) {
      if(typeof term!=='string' || !term.trim() || term.length>90) throw new TypeError('Busca inválida');
      const { payload } = await query('track.search', { track:term.trim(),limit:Math.max(1,Math.min(10,Number(limit)||5)) });
      const raw=payload?.results?.trackmatches?.track;
      const list=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
      return list.slice(0,5).map(x=>({
        title:String(x?.name||'').slice(0,115),
        artist:String(typeof x?.artist==='string'?x.artist:x?.artist?.name||'').slice(0,100),
        album:'', image:coverFromImages(x?.image),
      })).filter(x=>x.title&&x.artist);
    },
    coverFor,
  });
}
