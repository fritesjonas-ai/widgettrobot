/**
 * Optional album artwork fallback using Deezer's public album-search endpoint.
 * The search is accepted only when BOTH title and credited artist exactly match.
 * No user data, account token, artwork rehosting, or browser globals required.
 */
const TTL = 6 * 60 * 60 * 1000;
function normalized(text) {
  return String(text ?? '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function trustedCover(value) {
  const src = typeof value === 'string' ? value : '';
  // Do not allow arbitrary redirect hosts, protocols, or HTML injection.
  if (!/^https:\/\/(?:[a-z0-9-]+\.)?dzcdn\.net\/images\/cover\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9-]+\.jpe?g(?:\?.*)?$/i.test(src)) return '';
  return src;
}
export function createDeezerCoverClient({ request, clock = Date.now }) {
  if (typeof request !== 'function') throw new TypeError('Deezer: request ausente');
  const cache = new Map();
  const trackCache = new Map();
  return Object.freeze({
    async find(artist, album) {
      if (!normalized(artist) || !normalized(album)) return '';
      const key = normalized(artist) + '\u0000' + normalized(album);
      const now = clock();
      const hit = cache.get(key);
      if (hit && now - hit.at < TTL) return hit.cover;
      const url = 'https://api.deezer.com/search/album?q=' +
        encodeURIComponent(artist + ' ' + album) + '&limit=10';
      const response = await request(url);
      if (!response?.ok) return '';
      const json = await response.json();
      if (!Array.isArray(json?.data)) return '';
      let cover = '';
      for (const item of json.data) {
        if (normalized(item?.title) !== normalized(album) ||
            normalized(item?.artist?.name) !== normalized(artist)) continue;
        cover = trustedCover(item.cover_big) || trustedCover(item.cover_medium) ||
          trustedCover(item.cover_xl) || '';
        if (cover) break;
      }
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, { cover, at: now });
      return cover;
    },
    async findTrack(artist, title, album = '') {
      const empty = { image: '', album: '' };
      if (!normalized(artist) || !normalized(title)) return empty;
      const key = normalized(artist) + '\u0000' + normalized(title) + '\u0000' + normalized(album);
      const now = clock();
      const hit = trackCache.get(key);
      if (hit && now - hit.at < TTL) return hit.value;
      const url = 'https://api.deezer.com/search/track?q=' +
        encodeURIComponent(artist + ' ' + title) + '&limit=15';
      const response = await request(url);
      if (!response?.ok) return empty;
      const json = await response.json();
      if (!Array.isArray(json?.data)) return empty;
      let result = empty;
      for (const item of json.data) {
        if (normalized(item?.title) !== normalized(title) ||
            normalized(item?.artist?.name) !== normalized(artist) ||
            !normalized(item?.album?.title) ||
            (album && normalized(item?.album?.title) !== normalized(album))) continue;
        const image = trustedCover(item.album.cover_big) ||
          trustedCover(item.album.cover_medium) || trustedCover(item.album.cover_xl);
        if (image) {
          result = { image, album: item.album.title.slice(0, 130) };
          break;
        }
      }
      if (trackCache.size >= 128) trackCache.delete(trackCache.keys().next().value);
      trackCache.set(key, { value: result, at: now });
      return result;
    },
  });
}
