import { telegramFailure } from '../domain/errors.js';

/** SDK Bot API adapter. A rejected API call is not a success and is not silently retried. */
export function createTelegramMessenger({ api, logger = console }) {
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
      return call('sendRichMessage', { chat_id: chatId, rich_message: { html } });
    },
    async widget(chatId, { html, caption, data }) {
      // Never infer a Bot API rejection from omitted fields in an SDK return object.
      return call('sendWidget', { chat_id: chatId, html, width: 330, height: 390,
        caption, allow_queries: true, chat_data: data });
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
