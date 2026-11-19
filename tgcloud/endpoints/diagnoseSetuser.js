import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { profiles } from '../schema.js';
import { LASTFM_API_KEY } from '../lib/lastfm-key.js';
import { createProfileRepository } from '../lib/infrastructure/profile-repository.js';
import { createLastfmClient } from '../lib/infrastructure/lastfm-client.js';
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
