import { telegramFailure } from '../domain/errors.js';

/** SDK Bot API adapter. A rejected API call is not a success and is not silently retried. */
export function createTelegramMessenger({ api, logger = console }) {
  const nativeKeyboard = {
    inline_keyboard: [
      [{ text: 'Painel musical', callback_data: 'wt:widget' },
       { text: 'Tocando agora', callback_data: 'wt:now' }],
      [{ text: 'Últimas músicas', callback_data: 'wt:recent' },
       { text: 'Meu perfil', callback_data: 'wt:profile' }],
    ],
  };
  async function call(method, payload) {
    try {
      const result = await api[method](payload);
      if (result === false || result == null) throw new Error(`Telegram ${method}: resposta sem confirmação`);
      return result;
    } catch (error) {
      // The code/retry_after parameters are documented, the description string is not stable.
      const detail = telegramFailure(error);
      logger.error('Telegram API falhou', { ...detail, requestedMethod: method });
      throw error;
    }
  }
  return Object.freeze({
    rich(chatId, view) {
      const html = typeof view === 'string' ? view : view.html;
      return call('sendRichMessage', {
        chat_id: chatId, rich_message: { html }, reply_markup: nativeKeyboard,
      });
    },
    async widget(chatId, { html, caption, data }) {
      const message = await call('sendWidget', { chat_id: chatId, html, width: 330, height: 390,
        caption, allow_queries: true, chat_data: data });
      // The official API returns a Message whose widget field proves widget creation.
      // The Telegram client may still display its caption instead of rendering the widget.
      if (!message || !Number.isSafeInteger(message.message_id) || !message.widget) {
        logger.error('sendWidget returned no widget media', {
          hasMessageId: Number.isSafeInteger(message?.message_id),
          hasWidget: !!message?.widget,
        });
        throw new Error('sendWidget did not confirm Message.widget');
      }
      return message;
    },
    menu(chatId, text) {
      return call('sendMessage', {
        chat_id: chatId, text, reply_markup: nativeKeyboard,
      });
    },
    callbackAnswer(id, text) {
      return call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
    },
    widgetAnswer(id, data) {
      return call('answerWidgetQuery', { widget_query_id: id,
        data: typeof data === 'string' ? data : JSON.stringify(data) });
    },
    widgetUpdate(chatId, messageId, data) {
      return call('editMessageWidgetData', { chat_id: chatId, message_id: messageId, chat_data: data });
    },
  });
}
