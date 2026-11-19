/** MusicBrainz/CAA cover-art lookup. Only exact artist+album matches. */
const UA = 'widgettrobot/2.1 (https://github.com/fritesjonas-ai/widgettrobot)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL = 6 * 3600 * 1000;
function normalized(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function escaped(value) {
  return String(value).replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&');
}
function matching(group, artist, album) {
  const credit = group?.['artist-credit'];
  if (!UUID.test(group?.id || '') || normalized(group.title) !== normalized(album) ||
      !Array.isArray(credit)) return false;
  const name = credit.filter(x => x && typeof x === 'object')
    .map(x => x.name || x.artist?.name || '').join('');
  return normalized(name) === normalized(artist) && group['primary-type'] === 'Album';
}
export function createCoverArtArchiveClient({ request, clock = Date.now }) {
  if (typeof request !== 'function') throw new TypeError('HTTP request requerido');
  const cache = new Map();
  let lastSearch = -Infinity;
  async function getJSON(url) {
    const response = await request(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!response?.ok) return null;
    return response.json();
  }
  return Object.freeze({
    async find(artist, album) {
      if (!normalized(artist) || !normalized(album)) return '';
      const key = normalized(artist) + ':' + normalized(album);
      const now = clock();
      const hit = cache.get(key);
      if (hit && now - hit.at < TTL) return hit.image;
      // MusicBrainz limits searches to approximately one request/s per source IP.
      if (now - lastSearch < 1100) return '';
      lastSearch = now;
      const q = 'releasegroup:"' + escaped(album) + '" AND artist:"' + escaped(artist) + '" AND primarytype:album';
      const endpoint = 'https://musicbrainz.org/ws/2/release-group/?query=' +
        encodeURIComponent(q) + '&fmt=json&limit=5';
      const result = await getJSON(endpoint);
      if (!Array.isArray(result?.['release-groups'])) return '';
      const match = result['release-groups'].find(item => matching(item, artist, album));
      let image = '';
      if (match) {
        const id = match.id.toLowerCase();
        const manifest = await getJSON('https://coverartarchive.org/release-group/' + id);
        if (manifest?.images?.some(entry => entry?.front === true && entry?.approved !== false)) {
          image = 'https://coverartarchive.org/release-group/' + id + '/front-500';
        }
      }
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, { at: now, image });
      return image;
    },
  });
}
