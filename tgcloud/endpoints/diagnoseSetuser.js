import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { profiles } from '../schema.js';
import { LASTFM_API_KEY } from '../lib/lastfm-key.js';
import { createLastfmClient } from '../lib/infrastructure/lastfm-client.js';

// Executado somente via tgcloud run; não é publicado como endpoint.
export default async function () {
  const report = { urlSearchParams: typeof URLSearchParams, url: typeof URL };
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
  try {
    const row = await db.select().from(profiles).where(eq(profiles.telegramId, -1)).get();
    report.storage = { ok: true, found: row != null };
  } catch (error) {
    report.storage = { ok: false, name: typeof error?.name === 'string' ? error.name : 'unknown',
      code: typeof error?.code === 'string' ? error.code.slice(0, 40) : null };
  }
  return report;
}
