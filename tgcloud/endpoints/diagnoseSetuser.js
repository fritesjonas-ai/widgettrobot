import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { profiles } from '../schema.js';
import { LASTFM_API_KEY } from '../lib/lastfm-key.js';
import { createProfileRepository } from '../lib/infrastructure/profile-repository.js';
import { createLastfmClient } from '../lib/infrastructure/lastfm-client.js';
import { createCoverArtArchiveClient } from '../lib/infrastructure/cover-art-archive.js';
import { createDeezerCoverClient } from '../lib/infrastructure/deezer-cover.js';
import { makeState, compactState } from '../lib/domain/lastfm-parser.js';

// Executado somente via tgcloud run; não é publicado como endpoint.
export default async function () {
  const report = { urlSearchParams: typeof URLSearchParams, url: typeof URL, textEncoder: typeof TextEncoder };
  try {
    const data = compactState(makeState('', [], 'Configure o Last.fm com /setuser.', 'profile_missing'));
    report.widget = { ok: JSON.parse(data).k === 'profile_missing', dataBytes: data.length };
  } catch (error) {
    report.widget = { ok: false, errorName: typeof error?.name === 'string' ? error.name : 'unknown' };
  }
  try {
    const result = await createLastfmClient({ request: fetch, apiKey: LASTFM_API_KEY }).recent('rj', 1);
    report.lastfm = { ok: true, tracks: result.length };
  } catch (error) {
    report.lastfm = {
      ok: false,
      name: typeof error?.name === 'string' ? error.name : 'unknown',
      kind: typeof error?.kind === 'string' ? error.kind : 'unknown',
      apiCode: Number.isInteger(error?.apiCode) ? error.apiCode : null,
      status: Number.isInteger(error?.status) ? error.status : null,
    };
  }
  // Harmless, read-only verification of artwork retrieval on a known catalogue album.
  try {
    const image = await createLastfmClient({ request: fetch, apiKey: LASTFM_API_KEY })
      .coverFor({ artist: 'Cher', album: 'Believe', title: 'Believe', image: '' });
    report.artwork = { lookupOk: true, foundImage: Boolean(image) };
  } catch (error) {
    report.artwork = {
      lookupOk: false,
      kind: typeof error?.kind === 'string' ? error.kind : 'unexpected',
      apiCode: Number.isInteger(error?.apiCode) ? error.apiCode : null,
    };
  }
  // Read-only catalogue diagnostic: no Telegram profile is queried.
  try {
    const art = await createCoverArtArchiveClient({ request: fetch }).find('Cher', 'Believe');
    report.archive = { ok: true, hasCover: Boolean(art) };
  } catch (error) {
    report.archive = { ok: false, errorName: error?.name || 'unknown' };
  }
  // Read-only diagnostics, bounded to known public release-group identifiers.
  try {
    const headers = { 'User-Agent': 'widgettrobot/2.1 (https://github.com/fritesjonas-ai/widgettrobot)', Accept: 'application/json' };
    const q = encodeURIComponent('releasegroup:"Believe" AND artist:"Cher"');
    const mb = await fetch('https://musicbrainz.org/ws/2/release-group/?query=' + q + '&fmt=json&limit=5', { headers });
    let groups = [];
    if (mb.ok) {
      const parsed = await mb.json();
      groups = (parsed?.['release-groups'] || []).slice(0, 3).map(item => ({
        id: item.id, title: item.title, type: item['primary-type'],
        artist: item['artist-credit']?.filter(c => typeof c === 'object').map(c => c.name || c.artist?.name).join('') || '',
      }));
    }
    const group = await fetch('https://coverartarchive.org/release-group/550fe869-84da-38af-8c7c-f7770ade37da', { headers });
    let groupImages = null;
    if (group.ok) {
      const json = await group.json();
      groupImages = (json?.images || []).slice(0, 3).map(i => ({
        front: i.front, approved: i.approved, thumb: Boolean(i.thumbnails?.['500']),
      }));
    }
    const release = await fetch('https://coverartarchive.org/release/2ed5eeca-a58d-4a9a-9508-595cd18f0097', { headers });
    let releaseImages = null;
    if (release.ok) {
      const json = await release.json();
      releaseImages = (json?.images || []).slice(0, 3).map(i => ({
        front: i.front, approved: i.approved, thumb: Boolean(i.thumbnails?.['500']),
      }));
    }
    report.archiveProbe = {
      mbStatus: mb.status, groups,
      caaGroupStatus: group.status, groupImages,
      caaReleaseStatus: release.status, releaseImages,
    };
  } catch(error) {
    report.archiveProbe = { errorName: error?.name || 'unknown' };
  }
  // Check whether an alternate keyless public catalogue can identify missing covers.
  try {
    const response = await fetch('https://api.deezer.com/search/album?q=' +
      encodeURIComponent('Cher Believe') + '&limit=10');
    let items = [];
    if (response.ok) {
      const body = await response.json();
      items = (body?.data || []).slice(0, 5).map(x => ({
        title: x.title, artist: x.artist?.name, hasCover: Boolean(x.cover_big),
      }));
    }
    report.deezer = { status: response.status, items };
  } catch(error) { report.deezer = { errorName: error?.name || 'unknown' }; }
  try {
    const response = await fetch('https://ws.audioscrobbler.com/2.0/?method=album.getInfo&' +
      'artist=Cher&album=Believe&format=json&api_key=' + encodeURIComponent(LASTFM_API_KEY));
    const body = await response.json();
    report.albumMetadata = { status: response.status,
      hasMbid: Boolean(body?.album?.mbid),
      mbid: typeof body?.album?.mbid === 'string' ? body.album.mbid.slice(0,40) : null,
      images: body?.album?.image?.length || 0 };
  } catch(error) { report.albumMetadata = { errorName: error?.name || 'unknown' }; }
  try {
    const image = await createDeezerCoverClient({ request: fetch }).find('Cher','Believe');
    report.deezerCover = { ok:true, foundImage: Boolean(image), trustedHost: image.startsWith('https://') };
  } catch(error) {
    report.deezerCover = { ok:false, errorName: error?.name || 'unknown' };
  }
  // Sentinel negative ID is not a Telegram user. Never overwrite any existing row.
  const repository = createProfileRepository({ db, eq, profiles });
  const sentinelId = -700000000;
  let created = false;
  try {
    if (await repository.get(sentinelId) !== null) {
      report.storage = { ok: false, kind: 'sentinel_occupied' };
    } else {
      await repository.save(sentinelId, 'widgettrobot_diagnostic');
      created = true;
      const found = await repository.get(sentinelId);
      report.storage = { ok: found === 'widgettrobot_diagnostic', savedAndRead: found === 'widgettrobot_diagnostic' };
    }
  } catch (error) {
    report.storage = { ok: false, name: typeof error?.name === 'string' ? error.name : 'unknown',
      operation: typeof error?.operation === 'string' ? error.operation : null,
      code: typeof error?.dbCode === 'string' ? error.dbCode : null };
  } finally {
    if (created) {
      try {
        await repository.remove(sentinelId);
        report.storage.cleaned = (await repository.get(sentinelId)) === null;
      } catch (error) {
        report.storage.cleaned = false;
        report.storage.cleanupError = typeof error?.name === 'string' ? error.name : 'unknown';
      }
    }
  }
  if (!report.lastfm?.ok || !report.storage?.ok || report.storage.cleaned !== true || !report.widget?.ok) {
    throw new Error('Runtime /setuser validation failed: '+JSON.stringify(report));
  }
  return report;
}
