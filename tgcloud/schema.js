import { table, integer, text } from 'sdk/db';

export const profiles = table('lastfm_profiles', {
  telegramId: integer('telegram_id').primaryKey(),
  lastfmUser: text('lastfm_user').notNull(),
});
