import { shorten, profileUrl } from './format.js';

export function parseRecentTracks(payload) {
  const tracks = payload?.recenttracks?.track;
  if (!payload || !payload.recenttracks || !Object.hasOwn(payload.recenttracks, 'track')) {
    throw new TypeError('Estrutura recenttracks.track ausente');
  }
  if (!Array.isArray(tracks) && (!tracks || typeof tracks !== 'object')) {
    throw new TypeError('Estrutura recenttracks.track inválida');
  }
  const list = Array.isArray(tracks) ? tracks : [tracks];
  return list.map((item) => {
    const artist = typeof item?.artist === 'object' ? item.artist?.['#text'] : item?.artist;
    if (!item || typeof item.name !== 'string' || !item.name.trim() ||
        typeof artist !== 'string' || !artist.trim()) {
      throw new TypeError('Faixa Last.fm sem título ou artista');
    }
    const image = coverFromImages(item?.image);
    return {
      title: shorten(item.name, 120),
      artist: shorten(artist, 100),
      album: shorten(typeof item?.album === 'object' ? item.album['#text'] : item?.album || '', 80),
      nowplaying: String(item?.['@attr']?.nowplaying ?? '').toLowerCase() === 'true',
      playedAt: Number(item?.date?.uts) || 0,
      image,
    };
  });
}

// Select the best usable size. Some Last.fm responses contain blank image entries.
export function coverFromImages(images) {
  if (!Array.isArray(images)) return '';
  for (const size of ['extralarge', 'mega', 'large', 'medium', 'small']) {
    for (const entry of images) {
      if (entry?.size !== size) continue;
      const url = validCoverUrl(entry['#text']);
      if (url) return url;
    }
  }
  return '';
}

export function validCoverUrl(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  // Telegram Serverless does not expose URL; accept only the documented cover hosts.
  if (!/^https:\/\/(?:lastfm\.freetls\.fastly\.net|userserve-ak\.last\.fm)(?:\/|$)/i.test(source)) return '';
  // Last.fm's standard placeholder is not the actual album artwork.
  if (/2a96cbd8b46e442fc41c2b86b821562f/i.test(source)) return '';
  return source;
}

export function makeState(user, list, error = '', errorKind = '') {
  const track = list?.[0];
  if (error) return { mode: 'error', user, error: shorten(error, 120), errorKind, recent: [], updatedAt: Date.now() };
  return {
    mode: !track ? 'empty' : track.nowplaying ? 'playing' : 'last',
    user,
    title: track?.title || '',
    artist: track?.artist || '',
    album: track?.album || '',
    image: track?.image || '',
    playedAt: track?.playedAt || 0,
    recent: (list || []).slice(0, 5).map(t => ({title: t.title, artist: t.artist, nowplaying: !!t.nowplaying})),
    updatedAt: Date.now(),
  };
}

// Count UTF-8 bytes without TextEncoder (not available on Telegram Serverless).
const bytes = value => {
  let count = 0;
  for (const char of JSON.stringify(value)) {
    const cp = char.codePointAt(0);
    count += cp <= 0x7F ? 1 : cp <= 0x7FF ? 2 : cp <= 0xFFFF ? 3 : 4;
  }
  return count;
};

export function compactState(state) {
  // Widget chat_data and answerWidgetQuery data: <= 1024 UTF-8 bytes.
  // Compact keys preserve more songs for the Recentes tab.
  const out = {
    v: 1, m: state.mode || 'empty', u: shorten(state.user || '', 32),
    t: shorten(state.title || '', 80), a: shorten(state.artist || '', 70),
    b: shorten(state.album || '', 60), ts: Number(state.playedAt) || 0,
    e: shorten(state.error || '', 100), k: state.errorKind || '', at: Number(state.updatedAt) || 0,
    list: (state.recent || []).slice(0, 5).map(t => [shorten(t.artist, 45), shorten(t.title, 55), t.nowplaying ? 1 : 0]),
  };
  while (bytes(out) > 1024 && out.list.length > 1) out.list.pop();
  while (bytes(out) > 1024 && out.list.length) {
    const last = out.list[out.list.length - 1];
    const lenTitle = Array.from(last[1]).length;
    const lenArtist = Array.from(last[0]).length;
    if (lenTitle > 14) last[1] = shorten(last[1], Math.max(14, lenTitle - 8));
    else if (lenArtist > 12) last[0] = shorten(last[0], Math.max(12, lenArtist - 8));
    else out.list.pop();
  }
  for (const key of ['b', 'a', 't', 'e', 'u']) {
    while (bytes(out) > 1024 && out[key].length) {
      out[key] = shorten(out[key], Math.max(0, Array.from(out[key]).length - 8));
    }
  }
  if (bytes(out) > 1024) throw new RangeError('Estado do Widget excede 1024 bytes');
  return JSON.stringify(out);
}

export function recentTracksText(user, list) {
  return list.slice(0, 5).map((t, i) => `${i+1}. ${t.artist} — ${t.title}${t.nowplaying ? ' (tocando)' : ''}`).join('\n') || `Nenhuma música encontrada para ${user}.`;
}

export function lastfmProfile(user) { return profileUrl(user); }
