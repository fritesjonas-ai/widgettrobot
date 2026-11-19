import { StorageError } from '../domain/errors.js';

/** Persistence port. Failures are typed and retain their cause for runtime diagnostics. */
export function createProfileRepository({ db, eq, profiles }) {
  async function run(operation, task) {
    try { return await task(); }
    catch (cause) { throw new StorageError(operation, cause); }
  }
  return Object.freeze({
    get(telegramId) {
      return run('get', async () => {
        const row = await db.select().from(profiles)
          .where(eq(profiles.telegramId, telegramId)).get();
        return row?.lastfmUser ?? null;
      });
    },
    save(telegramId, lastfmUser) {
      return run('save', () => db.insert(profiles).values({ telegramId, lastfmUser })
        .onConflictDoUpdate({ target: profiles.telegramId, set: { lastfmUser } }).run());
    },
    remove(telegramId) {
      return run('remove', () => db.delete(profiles).where(eq(profiles.telegramId, telegramId)).run());
    },
  });
}
