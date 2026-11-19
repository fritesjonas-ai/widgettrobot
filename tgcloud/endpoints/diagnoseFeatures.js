import { fetch } from 'sdk';
import { LASTFM_API_KEY } from '../lib/lastfm-key.js';
import { createLastfmClient } from '../lib/infrastructure/lastfm-client.js';
import { createDeezerCoverClient } from '../lib/infrastructure/deezer-cover.js';
import { richViews } from '../lib/presentation/rich.js';

// Runs only after tgcloud push, against deployed application modules.
// No Telegram message, private user profile, or chat content is touched.
export default async function () {
  const lastfm = createLastfmClient({ request: fetch, apiKey: LASTFM_API_KEY });
  const tracks = await lastfm.search('Believe', 3);
  const artists = await lastfm.searchArtists('Cher', 3);
  if (!tracks.length || !artists.some(x => x.name.toLowerCase() === 'cher')) {
    throw new Error('Public Last.fm search contract did not return the expected entities');
  }
  const details = await lastfm.trackDetails({ artist: 'Cher', title: 'Believe' });
  const deezer = createDeezerCoverClient({ request: fetch });
  const cover = await deezer.findTrack('Cher', 'Believe');
  const rich = richViews.searchResults('Cher', tracks, '', artists, 'all');
  const help = richViews.searchHelp();
  if (!rich.includes('<h3>Faixas</h3>') || !rich.includes('<h3>Artistas</h3>') ||
      !rich.includes('<tg-button-row>') || !help.includes('/buscar artista')) {
    throw new Error('New Rich search output is inconsistent with public results');
  }
  return {
    lastfmSearch: { tracks: tracks.length, artists: artists.length },
    metadata: { albumFound: Boolean(details.album), imageFound: Boolean(details.image) },
    deezerTrackCover: { found: Boolean(cover?.image), albumFound: Boolean(cover?.album) },
    richSearch: { validated: true },
  };
}
