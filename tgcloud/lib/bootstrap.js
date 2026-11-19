// Composition root. Only here are the SDK, schema and concrete integrations wired.
import { api, db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { profiles } from '../schema.js';
import { LASTFM_API_KEY } from './lastfm-key.js';
import { createLastfmClient } from './infrastructure/lastfm-client.js';
import { createLyricsClient } from './infrastructure/lyrics-client.js';
import { createCoverArtArchiveClient } from './infrastructure/cover-art-archive.js';
import { createDeezerCoverClient } from './infrastructure/deezer-cover.js';
import { createProfileRepository } from './infrastructure/profile-repository.js';
import { createTelegramMessenger } from './infrastructure/telegram-messenger.js';
import { richViews } from './presentation/rich.js';
import { createBotService } from './application/bot-service.js';

export function createBot() {
  return createBotService({
    profiles: createProfileRepository({ db, eq, profiles }),
    lastfm: createLastfmClient({ request: fetch, apiKey: LASTFM_API_KEY }),
    lyrics: createLyricsClient({ request: fetch }),
    coverArt: createCoverArtArchiveClient({ request: fetch }),
    deezerCover: createDeezerCoverClient({ request: fetch }),
    messenger: createTelegramMessenger({ api }),
    views: richViews,
  });
}
