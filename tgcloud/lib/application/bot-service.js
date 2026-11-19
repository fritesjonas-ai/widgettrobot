import { parseMessage, fromCallback, fromWidget, ACTION } from '../domain/actions.js';
import { validateUsername } from '../domain/format.js';
import { makeState, compactState } from '../domain/lastfm-parser.js';
import { ExternalServiceError, StorageError, lastfmErrorDetail, telegramFailure } from '../domain/errors.js';

/** Application use cases. All SDK, HTTP, persistence and Telegram calls enter via ports. */
export function createBotService({ profiles, lastfm, lyrics = null, coverArt = null, deezerCover = null, messenger, views, logger = console }) {
  if (!profiles || !lastfm || !messenger || !views) throw new Error('Portas do bot não configuradas.');
  const privateChat = (chat, from) => chat?.type === 'private' &&
    Number.isSafeInteger(chat.id) && chat.id === from?.id;
  const send = (chatId, view) => messenger.rich(chatId, view);
  const recent = (user, count = 5) => lastfm.recent(user, count);
  async function artworkFor(track) {
    if (!track) return '';
    if (track.image) return track.image;
    let image='';
    try { image=await lastfm.coverFor(track); }
    catch(error) { record(error,'lastfm-cover'); }
    if (!image && deezerCover?.find && track.album) {
      try { image=await deezerCover.find(track.artist,track.album); }
      catch(error) { record(error,'deezer-cover'); }
    }
    if (!image && coverArt?.find && track.album) {
      try { image=await coverArt.find(track.artist,track.album); }
      catch(error) { record(error,'cover-art-archive'); }
    }
    return image;
  }
  const state = async user => {
    const tracks=await recent(user,5);
    if(tracks[0]) {
      const image=await artworkFor(tracks[0]);
      if(image) tracks[0]={...tracks[0],image};
    }
    return makeState(user,tracks);
  };

  function record(error, operation) {
    // Do not log thrown HTTP messages; they can include ?api_key=<secret>.
    const type = error instanceof ExternalServiceError ? {
      provider: error.provider, kind: error.kind, code: error.apiCode, status: error.status,
    } : error instanceof StorageError ? {
      kind: 'storage', databaseOperation: error.operation, dbCode: error.dbCode,
    } : Number.isInteger(Number(error?.code)) && Number(error?.code) >= 400 ?
      telegramFailure(error) : { kind: 'internal', errorName: error?.name || 'Error' };
    logger.error('Falha widgettrobot', { operation, ...type });
  }
  function failureView(error, title = 'Erro ao executar ação') {
    const detail = error instanceof ExternalServiceError ? lastfmErrorDetail(error) :
      'Não foi possível concluir a operação. Tente novamente ou avise o administrador do bot.';
    return views.error(title, detail);
  }
  async function withVisibleError(chatId, operation, task) {
    try { return await task(); }
    catch (error) {
      record(error, operation);
      // BotApiError: never retry a rejected Telegram request, especially HTTP 429.
      // The documented parameters.retry_after is logged for operations monitoring.
      if (Number.isInteger(Number(error?.code)) && Number(error?.code) >= 400) throw error;
      // If sending this explanatory message also fails, let the Serverless run fail.
      return send(chatId, failureView(error));
    }
  }
  async function sendCard(chatId, user) {
    if (!user) return send(chatId, views.musicCard({ user: '', mode: 'empty' }));
    let snapshot;
    try { snapshot = await state(user); }
    catch (error) {
      if (!(error instanceof ExternalServiceError)) throw error;
      record(error, 'lastfm-card');
      snapshot = { user, mode: 'error', error: lastfmErrorDetail(error) };
    }
    return send(chatId, views.musicCard(snapshot));
  }
  async function dispatch(chatId, userId, input) {
    const action=typeof input==='string' ? input : input?.action;
    const category=typeof input==='object' ? input.category||'tracks' : 'tracks';
    const period=typeof input==='object' ? input.period||'7day' : '7day';
    const term=typeof input==='object' ? input.term||'' : '';
    const user = await profiles.get(userId);
    if (action === ACTION.START) return user
      ? sendCard(chatId, user) : send(chatId, views.welcome(''));
    if (action === ACTION.HELP) return send(chatId, views.welcome(user || ''));
    if (action === ACTION.WIDGET) return sendCard(chatId, user);
    if (action === ACTION.PROFILE) return send(chatId, views.profile(user || ''));
    if (action === ACTION.SEARCH && !term) return send(chatId, views.searchHelp());
    if (!user && action !== ACTION.SEARCH) return send(chatId, views.profile(''));

    if (action === ACTION.SUMMARY) return send(chatId, views.summary(user));
    if ([ACTION.TOPS,ACTION.STATS,ACTION.LOVED,ACTION.WEEKLY,ACTION.DISCOVER].includes(action)) {
      try {
        if (action===ACTION.TOPS) {
          const items=await lastfm.top(user,category,period,5);
          let cover='';
          if (category==='artists' && items[0]?.artist) {
            // Derived from the owner's *personal* plays for the very same period;
            // artist.getTopTracks is global and would select someone else's ranking.
            const topTracks=await lastfm.top(user,'tracks',period,50);
            const name=items[0].artist.toLocaleLowerCase();
            const match=topTracks.find(track=>track.artist.toLocaleLowerCase()===name);
            cover=await artworkFor(match);
          } else {
            cover=await artworkFor(items[0]);
          }
          return send(chatId,views.tops({kind:category,period,items,cover}));
        }
        if (action===ACTION.STATS) {
          const info=await lastfm.info(user);
          let cover='';
          try {
            const latest=await recent(user,1);
            cover=await artworkFor(latest[0]);
          } catch(error) { record(error,'stats-cover'); }
          return send(chatId,views.stats(user,info,cover));
        }
        if (action===ACTION.LOVED) {
          const tracks=await lastfm.loved(user,5);
          const cover=await artworkFor(tracks[0]);
          return send(chatId,views.loved(user,tracks,cover));
        }
        if (action===ACTION.WEEKLY) {
          // Rolling seven days, not a calendar-week chart.
          const tracks=await lastfm.top(user,'tracks','7day',3);
          const artists=await lastfm.top(user,'artists','7day',3);
          const albums=await lastfm.top(user,'albums','7day',3);
          const cover=await artworkFor(tracks[0]);
          return send(chatId,views.weekly({tracks,artists,albums,cover}));
        }
        if (action===ACTION.DISCOVER) {
          const latest=await recent(user,1);
          if (!latest.length) return send(chatId,views.error('Descobrir','Nenhuma música recente disponível.'));
          const seed=latest[0];
          const result=await lastfm.similar(seed.artist,seed.title,5);
          const cover=result.kind==='tracks'?await artworkFor(result.items[0]):await artworkFor(seed);
          return send(chatId,views.discover({seed,result,cover}));
        }
      } catch(error) {
        if (!(error instanceof ExternalServiceError)) throw error;
        record(error,'lastfm-insights');
        return send(chatId,failureView(error,'Não foi possível consultar o Last.fm'));
      }
    }
    if ([ACTION.ALBUM,ACTION.LYRICS,ACTION.SEARCH].includes(action)) {
      try {
        if (action===ACTION.SEARCH) {
          const tracks=await lastfm.search(term,5);
          const cover=await artworkFor(tracks[0]);
          return send(chatId,views.searchResults(term,tracks,cover));
        }
        const recentTracks=await recent(user,1);
        const current=recentTracks[0];
        if (!current) return send(chatId,views.error('Nenhuma reprodução','Não há música recente para consultar.'));
        if (action===ACTION.ALBUM) {
          if (!current.album) return send(chatId,views.error('Álbum indisponível',
            'O Last.fm não informou o álbum da última música.'));
          const info=await lastfm.albumInfo(current.artist,current.album);
          const cover=info?.image||await artworkFor(current);
          return send(chatId,views.album(current,info,cover));
        }
        const preview=lyrics?.preview
          ? await lyrics.preview(current.artist,current.title)
          : {status:'unavailable',excerpt:''};
        const cover=await artworkFor(current);
        return send(chatId,views.lyrics(current,preview,cover));
      } catch(error) {
        if(!(error instanceof ExternalServiceError))throw error;
        record(error,'myjam-port');
        return send(chatId,failureView(error,'Não foi possível consultar a música'));
      }
    }
    if (action === ACTION.NOW) {
      try { return await send(chatId, views.current(await state(user))); }
      catch (error) {
        if (!(error instanceof ExternalServiceError)) throw error;
        record(error, 'lastfm-now');
        return send(chatId, failureView(error, 'Não foi possível consultar o Last.fm'));
      }
    }
    if (action === ACTION.RECENT) {
      try { return await send(chatId, views.recent(user, await recent(user, 5))); }
      catch (error) {
        if (!(error instanceof ExternalServiceError)) throw error;
        record(error, 'lastfm-recent');
        return send(chatId, failureView(error, 'Não foi possível consultar o Last.fm'));
      }
    }
    return send(chatId, views.error('Ação desconhecida', 'Use /ajuda para conhecer os comandos.'));
  }
  async function onMessage(message) {
    if (!privateChat(message?.chat, message?.from) || message.from?.is_bot) return;
    const chatId = message.chat.id;
    return withVisibleError(chatId, 'message', async () => {
      if (typeof message.text !== 'string') return send(chatId, views.error('Formato não suportado',
        'Este bot aceita comandos de texto. Use /ajuda para ver os comandos disponíveis.'));
      const input = parseMessage(message.text);
      if (input.kind === 'unknown') return send(chatId, views.error('Comando desconhecido', 'Use /ajuda para conhecer os comandos.'));
      if (input.kind === 'invalid') return send(chatId, views.error('Formato inválido', input.usage));
      if (input.kind === 'link') {
        if (!validateUsername(input.username)) return send(chatId, views.error('Usuário inválido',
          'Envie /setuser seu_usuario_lastfm. Use de 2 a 32 caracteres: letras, números, _ e -.'));
        try { await recent(input.username, 1); }
        catch (error) {
          if (!(error instanceof ExternalServiceError)) throw error;
          record(error, 'lastfm-link');
          return send(chatId, failureView(error, 'Não foi possível vincular'));
        }
        // Never replace a stored profile unless Last.fm validation succeeded.
        await profiles.save(chatId, input.username);
        return sendCard(chatId, input.username);
      }
      if (input.kind === 'unlink') {
        if (!input.confirmed) return send(chatId, views.unlinkHelp());
        await profiles.remove(chatId);
        return send(chatId, views.unlinked());
      }
      return dispatch(chatId, chatId, input);
    });
  }
  async function onCallback(query) {
    if (typeof query?.id !== 'string' || !query.id) throw new TypeError('CallbackQuery sem id');
    const action = fromCallback(query.data);
    const allowed = !!action && privateChat(query.message?.chat, query.from);
    // Required by Telegram even for rejected buttons; done before any slow work.
    await messenger.callbackAnswer(query.id, allowed ? undefined : 'Ação indisponível.');
    if (allowed) {
      return withVisibleError(query.message.chat.id, 'callback', () => dispatch(query.message.chat.id, query.from.id, action));
    }
  }
  async function onWidget(query) {
    if (typeof query?.id !== 'string' || !query.id) throw new TypeError('WidgetQuery sem id');
    const action = fromWidget(query.data);
    const allowed = query.type?.type === 'data' && !!action &&
      privateChat(query.chat, query.from) && Number.isSafeInteger(query.message_id);
    if (!allowed) return messenger.widgetAnswer(query.id, { ok: false, notice: 'Ação não autorizada.' });
    // Acknowledge before DB and Last.fm I/O to satisfy the 15-second deadline.
    // accepted != completed; the UI must wait for chatDataChanged or a Rich reply.
    await messenger.widgetAnswer(query.id, { ok: true, status: 'accepted' });
    let user;
    try { user = await profiles.get(query.from.id); }
    catch (error) {
      record(error, 'widget-profile');
      if (action !== 'refresh') return send(query.chat.id, failureView(error));
      return updateWidget(query, makeState('', [], 'Não foi possível consultar o perfil salvo.', 'storage'));
    }
    if (action !== 'refresh') {
      return withVisibleError(query.chat.id, 'widget-rich', () => dispatch(query.chat.id, query.from.id, action));
    }
    if (!user) return updateWidget(query, makeState('', [], 'Configure o Last.fm com /setuser.', 'profile_missing'));
    try { return updateWidget(query, await state(user)); }
    catch (error) {
      record(error, 'legacy-widget-lastfm');
      return updateWidget(query, makeState(user, [], lastfmErrorDetail(error),
        error instanceof ExternalServiceError ? error.kind : 'internal'));
    }
  }
  async function updateWidget(query, snapshot) {
    const data = compactState(snapshot);
    try { return await messenger.widgetUpdate(query.chat.id, query.message_id, data); }
    catch (error) { record(error, 'widget-update'); throw error; }
  }
  return Object.freeze({ onMessage, onCallback, onWidget });
}
