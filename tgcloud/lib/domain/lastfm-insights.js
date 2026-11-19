import { shorten } from './format.js';
import { coverFromImages } from './lastfm-parser.js';

function container(payload, root) {
  const data = payload?.[root];
  if (!data || typeof data !== 'object') throw new TypeError('Last.fm: resposta sem ' + root);
  return data;
}
function entries(data, key) {
  const value = data[key];
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  throw new TypeError('Last.fm: formato inválido para ' + key);
}
function value(text, limit = 90) {
  return shorten(typeof text === 'string' ? text.trim() : '', limit);
}
function artistName(raw) {
  return value(typeof raw === 'string' ? raw :
    raw?.name ?? raw?.['#text'] ?? raw?.artist?.name ?? '', 90);
}
function count(raw) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
export function parseRanking(payload, root, key, kind) {
  const list = entries(container(payload, root), key).slice(0, 50);
  return list.map(item => {
    const name = value(item?.name, 115);
    const artist = kind === 'artists' ? name : artistName(item?.artist);
    if (!name || (kind !== 'artists' && !artist)) {
      throw new TypeError('Last.fm: ranking sem nome ou artista');
    }
    return {
      title: name, artist,
      album: kind === 'albums' ? name : '',
      playcount: count(item?.playcount),
      image: coverFromImages(item?.image),
    };
  });
}
export function parseUserInfo(payload) {
  const user = payload?.user;
  if (!user || typeof user !== 'object' || !value(user.name)) {
    throw new TypeError('Last.fm: perfil inválido');
  }
  const registered = Number(user?.registered?.unixtime ?? user?.registered?.['#text']) || 0;
  return {
    user:value(user.name,32),
    scrobbles:count(user.playcount),
    artists:user.artist_count == null ? null : count(user.artist_count),
    albums:user.album_count == null ? null : count(user.album_count),
    tracks:user.track_count == null ? null : count(user.track_count),
    registered:Number.isSafeInteger(registered) && registered > 0 ? registered : 0,
  };
}
export function parseLovedTracks(payload) {
  return entries(container(payload,'lovedtracks'),'track').slice(0,10).map(item => {
    const title=value(item?.name,115), artist=artistName(item?.artist);
    if(!title || !artist) throw new TypeError('Last.fm: favorita sem título ou artista');
    return {title,artist,album:'',image:coverFromImages(item?.image)};
  });
}
export function parseSimilarTracks(payload) {
  return entries(container(payload,'similartracks'),'track').slice(0,10).map(item => {
    const title=value(item?.name,115), artist=artistName(item?.artist);
    if(!title || !artist) throw new TypeError('Last.fm: recomendação sem título ou artista');
    return {title,artist,album:'',image:coverFromImages(item?.image)};
  });
}
export function parseSimilarArtists(payload) {
  return entries(container(payload,'similarartists'),'artist').slice(0,10).map(item => {
    const artist=value(item?.name,90);
    if(!artist) throw new TypeError('Last.fm: artista recomendado sem nome');
    return {title:'',artist,album:'',image:''};
  });
}
