import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { profiles } from '../schema.js';
import { LASTFM_API_KEY } from '../lib/lastfm-key.js';
import { createProfileRepository } from '../lib/infrastructure/profile-repository.js';
import { createLastfmClient } from '../lib/infrastructure/lastfm-client.js';
import { createDeezerCoverClient } from '../lib/infrastructure/deezer-cover.js';

// Ephemeral read-only catalogue smoke-check and isolated SQLite round-trip.
export default async function () {
  const report = {};
  try {
    const tracks = await createLastfmClient({ request: fetch, apiKey: LASTFM_API_KEY })
      .recent('rj', 1);
    report.lastfm = { ok: true, count: tracks.length };
  } catch (error) {
    report.lastfm = { ok: false, kind: error?.kind || 'unknown' };
  }
  try {
    const image = await createDeezerCoverClient({ request: fetch })
      .find('Cher', 'Believe');
    report.artwork = { ok: true, coverFound: Boolean(image) };
  } catch (error) {
    report.artwork = { ok: false, errorName: error?.name || 'unknown' };
  }

  // Never touch a real Telegram user's profile; delete the sentinel after checking.
  const repository = createProfileRepository({ db, eq, profiles });
  const sentinelId = -700000000;
  let created = false;
  try {
    if (await repository.get(sentinelId) !== null) {
      report.storage = { ok: false, reason: 'sentinel_occupied' };
    } else {
      await repository.save(sentinelId, 'widgettrobot_diagnostic');
      created = true;
      const value = await repository.get(sentinelId);
      report.storage = { ok: value === 'widgettrobot_diagnostic' };
    }
  } catch (error) {
    report.storage = { ok: false, operation: error?.operation || 'unknown' };
  } finally {
    if (created) {
      try {
        await repository.remove(sentinelId);
        report.storage.cleaned = (await repository.get(sentinelId)) === null;
      } catch (error) {
        report.storage.cleaned = false;
      }
    }
  }
  if (!report.lastfm?.ok || !report.storage?.ok || report.storage.cleaned !== true) {
    throw new Error('Serverless smoke-check failed: ' + JSON.stringify(report));
  }
  return report;
}
