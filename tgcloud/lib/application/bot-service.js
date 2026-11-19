import { parseMessage, fromCallback, fromWidget, ACTION } from '../domain/actions.js';
import { validateUsername } from '../domain/format.js';
import { makeState, compactState } from '../domain/lastfm-parser.js';
import { ExternalServiceError, StorageError, lastfmErrorDetail, telegramFailure } from '../domain/errors.js';

/** Application use cases. All SDK, HTTP, persistence and Telegram calls enter via ports. */
export function createBotService({ profiles, lastfm, messenger, views, widgetHtml, logger = console }) {
  if (!profiles || !lastfm || !messenger || !views || !widgetHtml) throw new Error('Portas do bot não configuradas.');
  const privateChat = (chat, from) => chat?.type === 'private' &&
    Number.isSafeInteger(chat.id) && chat.id === from?.id;
  const send = (chatId, view) => messenger.rich(chatId, view);
  const recent = (user, count = 5) => lastfm.recent(user, count);
  const state = async user => makeState(user, await recent(user, 5));

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
  async function getWidgetState(user) {
    try { return await state(user); }
    catch (error) {
      record(error, 'widget-lastfm');
      return makeState(user, [], lastfmErrorDetail(error),
        error instanceof ExternalServiceError ? error.kind : 'internal');
    }
  }
  async function sendPanel(chatId, user) {
    const snapshot = user
      ? await getWidgetState(user)
      : makeState('', [], 'Configure seu Last.fm com /setuser usuario.', 'profile_missing');
    let created = null;
    try {
      created = await messenger.widget(chatId, {
        html: widgetHtml,
        caption: user ? `Last.fm · @${user} · painel musical` : 'Last.fm · configure seu perfil',
        data: compactState(snapshot),
      });
    } catch (error) {
      record(error, 'send-widget');
    }
    // A standard Telegram message is deliberately used as a compatibility menu:
    // older clients may show only the widget caption and hide Rich buttons.
    const notice = created?.widget
      ? `Widget confirmado pela Bot API (mensagem #${created.message_id}). Se o painel não aparecer, este aplicativo pode não suportar Widgets. Use os botões abaixo.`
      : 'Falha ao criar o Widget na Bot API. O painel não foi confirmado. Use os botões abaixo para consultar seu Last.fm.';
    await messenger.menu(chatId, notice);
    return created;
  }
  async function dispatch(chatId, userId, action) {
    const user = await profiles.get(userId);
    if (action === ACTION.START) {
      await send(chatId, views.welcome(user || ''));
      return sendPanel(chatId, user);
    }
    if (action === ACTION.HELP) return send(chatId, views.welcome(user || ''));
    if (action === ACTION.WIDGET) return sendPanel(chatId, user);
    if (action === ACTION.PROFILE) return send(chatId, views.profile(user || ''));
    if (!user) return send(chatId, views.profile(''));
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
        await send(chatId, views.linked(input.username));
        return sendPanel(chatId, input.username);
      }
      if (input.kind === 'unlink') {
        if (!input.confirmed) return send(chatId, views.unlinkHelp());
        await profiles.remove(chatId);
        return send(chatId, views.unlinked());
      }
      return dispatch(chatId, chatId, input.action);
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
    return updateWidget(query, await getWidgetState(user));
  }
  async function updateWidget(query, snapshot) {
    const data = compactState(snapshot);
    try { return await messenger.widgetUpdate(query.chat.id, query.message_id, data); }
    catch (error) { record(error, 'widget-update'); throw error; }
  }
  return Object.freeze({ onMessage, onCallback, onWidget });
}
