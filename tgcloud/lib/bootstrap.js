// Composition root. Only here are the SDK, schema and concrete integrations wired.
import { api, db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { profiles } from '../schema.js';
import { LASTFM_API_KEY } from './lastfm-key.js';
import { createLastfmClient } from './infrastructure/lastfm-client.js';
import { createProfileRepository } from './infrastructure/profile-repository.js';
import { createTelegramMessenger } from './infrastructure/telegram-messenger.js';
import { richViews } from './presentation/rich.js';
import { LASTFM_WIDGET_HTML } from './presentation/widget.js';
import { createBotService } from './application/bot-service.js';

export function createBot() {
  return createBotService({
    profiles: createProfileRepository({ db, eq, profiles }),
    lastfm: createLastfmClient({ request: fetch, apiKey: LASTFM_API_KEY }),
    messenger: createTelegramMessenger({ api }),
    views: richViews,
    widgetHtml: LASTFM_WIDGET_HTML,
  });
}
