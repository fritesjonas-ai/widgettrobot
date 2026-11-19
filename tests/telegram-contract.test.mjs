import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotService } from '../tgcloud/lib/application/bot-service.js';
import { createLastfmClient } from '../tgcloud/lib/infrastructure/lastfm-client.js';
import { createTelegramMessenger } from '../tgcloud/lib/infrastructure/telegram-messenger.js';
import { richViews } from '../tgcloud/lib/presentation/rich.js';
import { LASTFM_WIDGET_HTML } from '../tgcloud/lib/presentation/widget.js';

const me = { id: 123, is_bot: false };
const privateChat = { id: 123, type: 'private' };
const message = text => ({ text, from: me, chat: privateChat });
const widgetQuery = (id, data = 'refresh', override = {}) => ({
  id, data, type: { type: 'data' }, from: me, chat: privateChat, message_id: 77, ...override,
});
const callback = (data, override = {}) => ({
  id: 'cb-1', data, from: me, message: { chat: privateChat }, ...override,
});
const song = (name = 'Starlight', artist = 'Muse', playing = false, image = '') => ({
  name, artist: { '#text': artist }, album: { '#text': 'Black Holes' },
  ...(playing ? { '@attr': { nowplaying: 'true' } } : { date: { uts: '1731957000' } }),
  ...(image ? { image: [{ size: 'extralarge', '#text': image }] } : {}),
});
const tracks = (...entries) => ({ recenttracks: { track: entries } });
const html = call => call.data.rich_message.html;
const apiError = (code, method, parameters = {}) => Object.assign(new Error('SDK BotApiError'), {
  code, method, parameters,
});

function setup({ payload = tracks(song('Starlight', 'Muse', true)), status = 200 } = {}) {
  const stored = new Map();
  const calls = [], requests = [], logs = [], activity = [];
  const fails = {};
  let music = payload, httpStatus = status, networkError = false, badJson = false;
  const logger = { error(...values) { logs.push(values); } };
  const api = Object.fromEntries(['sendRichMessage', 'sendWidget', 'answerWidgetQuery',
    'answerCallbackQuery', 'editMessageWidgetData'].map(method => [method, async data => {
    activity.push(method);
    calls.push({ method, data });
    if (fails[method]) throw fails[method];
    return method === 'sendWidget' ? { message_id: 77 } :
      method === 'sendRichMessage' ? { message_id: 200 } : true;
  }]));
  const profiles = {
    async get(id) { activity.push('profiles.get'); if (fails.get) throw fails.get; return stored.get(id) ?? null; },
    async save(id, user) { activity.push('profiles.save'); if (fails.save) throw fails.save; stored.set(id, user); },
    async remove(id) { activity.push('profiles.remove'); if (fails.remove) throw fails.remove; stored.delete(id); },
  };
  const lastfm = createLastfmClient({
    apiKey: 'private-ci-key',
    request: async raw => {
      activity.push('lastfm.fetch');
      requests.push(new URL(raw));
      if (networkError) throw Error('fetch https://ws.audioscrobbler.com/?api_key=private-ci-key FAILED');
      return {
        ok: httpStatus >= 200 && httpStatus < 300,
        status: httpStatus,
        json: async () => { if (badJson) throw new SyntaxError('invalid JSON'); return music; },
      };
    },
  });
  const bot = createBotService({
    profiles, lastfm,
    messenger: createTelegramMessenger({ api, logger }),
    views: richViews, widgetHtml: LASTFM_WIDGET_HTML, logger,
  });
  return {
    bot, stored, calls, requests, logs, fails, activity,
    setPayload(value) { music = value; },
    setStatus(value) { httpStatus = value; },
    setNetworkError(value) { networkError = value; },
    setBadJson(value) { badJson = value; },
    clear() { calls.length = 0; requests.length = 0; logs.length = 0; activity.length = 0; },
  };
}
async function link(h, username = 'pessoa123') {
  await h.bot.onMessage(message('/setuser ' + username));
}

test('Last.fm nowplaying, últimas faixas e formato Rich seguem os contratos documentados', async () => {
  const h = setup();
  await link(h);
  await h.bot.onMessage(message('/now'));
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].searchParams.get('method'), 'user.getRecentTracks');
  assert.equal(h.requests[0].searchParams.get('limit'), '1');
  assert.equal(h.requests[1].searchParams.get('limit'), '5');
  assert.match(html(h.calls.at(-1)), /^<h3>Tocando agora<\/h3>/);
  assert.match(html(h.calls.at(-1)), /<b>Starlight<\/b>/);
  h.setPayload(tracks(song('Última Faixa', 'Muse', false)));
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls.at(-1)), /^<h3>Última reprodução<\/h3>/);
  h.setPayload(tracks());
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls.at(-1)), /^<h3>Sem reproduções<\/h3>/);
});

test('Last.fm erro 6 com usuário inexistente impede vínculo e preserva perfil salvo', async () => {
  const h = setup();
  await link(h);
  h.setPayload({ error: 6, message: 'User not found' });
  h.clear();
  await link(h, 'fantasma');
  assert.equal(h.stored.get(123), 'pessoa123');
  assert.match(html(h.calls.at(-1)), /Usuário do Last.fm inválido ou inexistente/);
  assert.deepEqual(h.logs.at(-1)[1].code, 6);
});

test('códigos Last.fm 10, 26 e 29 são diferenciados e não exibem dados obsoletos', async t => {
  const h = setup();
  await link(h);
  for (const [code, expected] of [[10, /chave.*inválida/i], [26, /chave.*suspensa/i], [29, /limitou as consultas/i]]) {
    await t.test(`Last.fm ${code}`, async () => {
      h.setPayload({ error: code, message: 'Erro do Last.fm' });
      h.clear();
      await h.bot.onMessage(message('/now'));
      const reply = html(h.calls.at(-1));
      assert.match(reply, expected);
      assert.doesNotMatch(reply, /Starlight/);
      assert.equal(h.logs[0][1].code, code);
      if (code === 10) assert.doesNotMatch(reply, /suspensa/i);
      if (code === 26) assert.doesNotMatch(reply, /inválida/i);
    });
  }
});

test('JSON malformado ou HTTP 503 do Last.fm nunca são interpretados como lista vazia', async () => {
  const h = setup();
  await link(h);
  h.setPayload({ hello: 'invalid-schema' });
  h.clear();
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls.at(-1)), /dados inesperados/);
  assert.doesNotMatch(html(h.calls.at(-1)), /Sem reproduções/);

  h.setPayload(tracks());
  h.setStatus(503);
  h.setBadJson(true);
  h.clear();
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls.at(-1)), /temporariamente indisponível/);
});

test('falha de rede não expõe api_key em mensagens ou logs', async () => {
  const h = setup();
  await link(h);
  h.setNetworkError(true);
  h.clear();
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls.at(-1)), /Não foi possível conectar/);
  assert.doesNotMatch(JSON.stringify(h.calls) + JSON.stringify(h.logs), /private-ci-key/);
});

test('escapa metadados Last.fm no Rich e mantém cinco músicas no histórico', async () => {
  const h = setup({ payload: tracks(song('<script>exploit</script>', 'A & B', true),
    song('Track 2'), song('Track 3'), song('Track 4'), song('Track 5'), song('Track 6')) });
  await link(h);
  h.clear();
  await h.bot.onMessage(message('/recentes'));
  const content = html(h.calls.at(-1));
  assert.match(content, /&lt;script&gt;exploit&lt;\/script&gt;/);
  assert.match(content, /A &amp; B/);
  assert.doesNotMatch(content, /<script>|Track 6/);
  assert.equal((content.match(/<li>/g) || []).length, 5);
});

test('Widget responde ACK antes da consulta e só confirma estado via editMessageWidgetData', async () => {
  const h = setup();
  await link(h);
  h.setPayload(tracks(song('Nova faixa', 'Banda', true)));
  h.clear();
  await h.bot.onWidget(widgetQuery('q1'));
  assert.deepEqual(h.activity, ['answerWidgetQuery', 'profiles.get', 'lastfm.fetch', 'editMessageWidgetData']);
  assert.deepEqual(JSON.parse(h.calls[0].data.data), { ok: true, status: 'accepted' });
  const data = JSON.parse(h.calls[1].data.chat_data);
  assert.equal(data.m, 'playing');
  assert.equal(data.t, 'Nova faixa');
  assert.notEqual(h.calls[0].data.data, h.calls[1].data.chat_data);
  assert.ok(Buffer.byteLength(h.calls[1].data.chat_data, 'utf8') <= 1024);
});

test('Last.fm indisponível no Widget vira estado de erro, nunca música vazia', async () => {
  const h = setup();
  await link(h);
  h.setPayload({ error: 29, message: 'Rate limit exceeded' });
  h.clear();
  await h.bot.onWidget(widgetQuery('q2'));
  const data = JSON.parse(h.calls[1].data.chat_data);
  assert.equal(data.m, 'error');
  assert.equal(data.k, 'rate_limited');
  assert.match(data.e, /limitou as consultas/);
  assert.equal(data.t, '');
  assert.equal(h.logs[0][1].code, 29);
});

test('falha ao editar Widget é propagada e registrada pelo código do SDK, sem sucesso fictício', async () => {
  const h = setup();
  await link(h);
  h.clear();
  h.fails.editMessageWidgetData = apiError(429, 'editMessageWidgetData', { retry_after: 13 });
  await assert.rejects(h.bot.onWidget(widgetQuery('q3')), e => e.code === 429);
  assert.deepEqual(h.calls.map(c => c.method), ['answerWidgetQuery', 'editMessageWidgetData']);
  assert.equal(h.logs[0][1].kind, 'rate_limited');
  assert.equal(h.logs[0][1].retryAfter, 13);
});

test('resposta Widget recusada pelo Telegram interrompe consulta sem editar', async () => {
  const h = setup();
  await link(h);
  h.clear();
  h.fails.answerWidgetQuery = apiError(400, 'answerWidgetQuery');
  await assert.rejects(h.bot.onWidget(widgetQuery('q4')), e => e.code === 400);
  assert.equal(h.calls.length, 1);
  assert.equal(h.requests.length, 0);
});

test('consultas Widget forjadas, não-data ou originadas de outro usuário são rejeitadas sem buscar música', async () => {
  const h = setup();
  await link(h);
  h.clear();
  await h.bot.onWidget(widgetQuery('q5', 'nada-a-ver'));
  await h.bot.onWidget(widgetQuery('q6', 'refresh', { type: { type: 'sign_data' } }));
  await h.bot.onWidget(widgetQuery('q7', 'refresh', { from: { id: 222 } }));
  assert.deepEqual(h.calls.map(c => c.method), ['answerWidgetQuery', 'answerWidgetQuery', 'answerWidgetQuery']);
  assert.equal(h.requests.length, 0);
  assert.ok(h.calls.every(c => JSON.parse(c.data.data).ok === false));
});

test('callback sempre recebe ACK, inclusive rejeitado; erro de Rich 429 não gera retry imediato', async () => {
  const h = setup();
  await link(h);
  h.clear();
  await h.bot.onCallback(callback('wt:now', { from: { id: 222 } }));
  assert.deepEqual(h.calls.map(c => c.method), ['answerCallbackQuery']);
  assert.match(h.calls[0].data.text, /indisponível/);

  h.clear();
  h.fails.sendRichMessage = apiError(429, 'sendRichMessage', { retry_after: 8 });
  await assert.rejects(h.bot.onCallback(callback('wt:now')), e => e.code === 429);
  assert.deepEqual(h.calls.map(c => c.method), ['answerCallbackQuery', 'sendRichMessage']);
  assert.ok(h.logs.some(entry => entry[1].retryAfter === 8));
});

test('falha SQLite durante vínculo preserva associação anterior e responde com erro', async () => {
  const h = setup();
  await link(h);
  h.clear();
  h.fails.save = Error('SQLite locked');
  await link(h, 'outra_pessoa');
  assert.equal(h.stored.get(123), 'pessoa123');
  assert.match(html(h.calls.at(-1)), /Não foi possível concluir a operação/);
  assert.doesNotMatch(html(h.calls.at(-1)), /Perfil vinculado/);
});

test('Falha Telegram ao enviar Rich não é mascarada como confirmação', async () => {
  const h = setup();
  await link(h);
  h.clear();
  h.fails.sendRichMessage = apiError(400, 'sendRichMessage');
  await assert.rejects(h.bot.onMessage(message('/now')), e => e.code === 400);
  assert.equal(h.calls.filter(c => c.method === 'sendRichMessage').length, 1);
  assert.ok(h.logs.some(entry => entry[1].code === 400));
});

test('uma falha ao excluir o perfil não responde como desvinculação concluída', async () => {
  const h = setup();
  await link(h);
  h.clear();
  h.fails.remove = Error('db write failed');
  await h.bot.onMessage(message('/remover confirmar'));
  assert.equal(h.stored.get(123), 'pessoa123');
  assert.match(html(h.calls.at(-1)), /Não foi possível concluir/);
  assert.doesNotMatch(html(h.calls.at(-1)), /Perfil desvinculado/);
});

test('comando desconhecido produz instrução explícita, sem abrir perfil como fallback', async () => {
  const h = setup();
  await link(h);
  h.clear();
  await h.bot.onMessage(message('/comando_inexistente'));
  assert.match(html(h.calls.at(-1)), /Comando desconhecido/);
  assert.match(html(h.calls.at(-1)), /\/ajuda/);
});

test('Widget controla payload UTF-8 dentro de 1024 bytes com nomes internacionais', async () => {
  const huge = '音🎼á'.repeat(100);
  const h = setup({ payload: tracks(...Array.from({ length: 8 }, (_, i) => song(`${i}: ${huge}`, huge, i === 0))) });
  await link(h);
  h.clear();
  await h.bot.onMessage(message('/widget'));
  const call = h.calls.at(-1);
  assert.equal(call.method, 'sendWidget');
  assert.equal(call.data.allow_queries, true);
  assert.ok(Buffer.byteLength(call.data.chat_data, 'utf8') <= 1024);
  assert.equal(JSON.parse(call.data.chat_data).m, 'playing');
});

test('HTTP 429 sem código JSON ainda mostra rate limit oficial e não faixas vazias', async () => {
  const h = setup();
  await link(h);
  h.setStatus(429);
  h.setPayload({ recenttracks: { track: [] } });
  h.clear();
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls.at(-1)), /limitou as consultas/);
  assert.doesNotMatch(html(h.calls.at(-1)), /Sem reproduções/);
});

test('Last.fm track null e artist ausente não produzem falsa ausência de scrobbles', async () => {
  const h = setup();
  await link(h);
  for (const bad of [{ recenttracks: { track: null } }, { recenttracks: { track: [{ name: 'Bad' }] } }]) {
    h.setPayload(bad);
    h.clear();
    await h.bot.onMessage(message('/now'));
    assert.match(html(h.calls.at(-1)), /dados inesperados/);
    assert.doesNotMatch(html(h.calls.at(-1)), /Sem reproduções/);
  }
});

test('Widget sem perfil ou com erro de leitura SQLite informa estado de erro após ACK', async () => {
  const h = setup();
  await h.bot.onWidget(widgetQuery('q8'));
  assert.deepEqual(h.calls.map(c => c.method), ['answerWidgetQuery', 'editMessageWidgetData']);
  assert.match(JSON.parse(h.calls[1].data.chat_data).e, /Configure o Last.fm/);
  assert.equal(h.requests.length, 0);
  h.clear();
  h.fails.get = Error('SQLite failed');
  await h.bot.onWidget(widgetQuery('q9'));
  assert.deepEqual(h.calls.map(c => c.method), ['answerWidgetQuery', 'editMessageWidgetData']);
  assert.equal(JSON.parse(h.calls[1].data.chat_data).m, 'error');
  assert.match(JSON.parse(h.calls[1].data.chat_data).e, /perfil salvo/);
  assert.ok(h.logs.some(entry => entry[1].operation === 'widget-profile'));
});

test('API Telegram que retorna false em answerWidgetQuery não equivale a ACK confirmado', async () => {
  const messenger = createTelegramMessenger({
    api: { answerWidgetQuery: async () => false }, logger: { error() {} },
  });
  await assert.rejects(
    messenger.widgetAnswer('q-false', { ok: true }), /resposta sem confirmação/,
  );
});

// Exercise the published inline Widget against a minimal DOM boundary. Assertions
// target visible UI states and request behavior, not variable names or helpers.
async function mountWidget(initial, requestImpl, context = {}) {
  const { Script, createContext } = await import('node:vm');
  const controls = new Map(), requests = [], events = {}, timers = [], intervals = [];
  function element() {
    const children = [], listeners = {};
    return {
      textContent: '', className: '', style: {}, disabled: false,
      listeners,
      get firstChild() { return children[0] ?? null; },
      appendChild(child) { children.push(child); return child; },
      removeChild(child) { children.splice(children.indexOf(child), 1); return child; },
      addEventListener(event, handler) { listeners[event] = handler; },
    };
  }
  const document = {
    hidden: false,
    getElementById(id) { if (!controls.has(id)) controls.set(id, element()); return controls.get(id); },
    createElement() { return element(); },
  };
  const widget = {
    chatData: JSON.stringify(initial), chatType: 'private', isActive: true,
    isPreview: false, isForward: false, ...context,
    request(action) { requests.push(action); return requestImpl(action); },
    onEvent(type, handler) { events[type] = handler; },
    openLink() {}, ready() {},
  };
  const script = LASTFM_WIDGET_HTML.match(/<script>([\s\S]+?)<\/script>/)?.[1];
  assert.ok(script, 'HTML Widget deve conter script executável');
  new Script(script).runInContext(createContext({
    window: { TelegramWidget: widget }, document,
    setInterval(fn) { intervals.push(fn); return intervals.length; },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
  }));
  return {
    widget, controls, requests, timers, intervals,
    change(data) { widget.chatData = JSON.stringify(data); events.chatDataChanged(); },
    click(id) { controls.get(id).listeners.click(); },
    flush: () => new Promise(resolve => setImmediate(resolve)),
  };
}

test('Widget suspende polling em erro Last.fm 29; retoma somente após atualização manual confirmada', async () => {
  const errorState = { v: 1, m: 'error', u: 'pessoa123', k: 'rate_limited', e: 'Last.fm limitou as consultas', list: [] };
  const display = await mountWidget(errorState, async () => ({ result: '{"ok":true,"status":"accepted"}' }));
  assert.equal(display.requests.length, 0, 'estado 29 não pode disparar refresh automático');
  display.intervals[0]();
  assert.equal(display.requests.length, 0, 'timer não pode repetir erro 29');
  display.click('refresh');
  await display.flush();
  assert.equal(display.requests.length, 1, 'atualização manual continua disponível');
  assert.match(display.controls.get('note').textContent, /Aguardando atualização/);
  display.change({ v: 1, m: 'playing', u: 'pessoa123', t: 'Agora', a: 'Artista', k: '', list: [] });
  assert.match(display.controls.get('note').textContent, /Dados atualizados/);
  display.intervals[0]();
  assert.equal(display.requests.length, 2, 'polling volta após atualização real');
});

test('Widget não mostra falso timeout quando chatDataChanged chega antes da resposta ao request', async () => {
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const display = await mountWidget({ v: 1, m: 'playing', u: 'pessoa123', t: 'Antes', list: [] }, () => deferred);
  assert.equal(display.requests.length, 1);
  display.change({ v: 1, m: 'playing', u: 'pessoa123', t: 'Depois', list: [] });
  release({ result: '{"ok":true,"status":"accepted"}' });
  await display.flush();
  assert.match(display.controls.get('title').textContent, /Depois/);
  assert.match(display.controls.get('note').textContent, /Dados atualizados/);
  assert.equal(display.timers.length, 0, 'não deve criar timeout de operação já confirmada');
});

// Contratos dos métodos HTTP definidos pela Bot API 10.4. Verificamos a
// requisição efetivamente entregue ao adapter, não comentários ou símbolos.
test('payloads reais Telegram seguem campos e tipos documentados para Rich, Widget, ACK e edição', async () => {
  const h = setup();
  await link(h);
  h.clear();
  await h.bot.onMessage(message('/start'));
  assert.equal(h.calls[0].method, 'sendRichMessage');
  assert.deepEqual(Object.keys(h.calls[0].data).sort(), ['chat_id', 'rich_message']);
  assert.equal(h.calls[0].data.chat_id, 123);
  assert.equal(typeof h.calls[0].data.rich_message.html, 'string');
  assert.match(h.calls[0].data.rich_message.html, /<tg-button type="callback_data"/);

  h.clear();
  await h.bot.onMessage(message('/widget'));
  const send = h.calls[0];
  assert.equal(send.method, 'sendWidget');
  assert.deepEqual(Object.keys(send.data).sort(),
    ['allow_queries', 'caption', 'chat_data', 'chat_id', 'height', 'html', 'width']);
  assert.equal(send.data.allow_queries, true);
  assert.ok(send.data.width >= 200 && send.data.height >= 50 && send.data.height <= 600);
  assert.equal(JSON.parse(send.data.chat_data).v, 1);
  assert.ok(Buffer.byteLength(send.data.chat_data, 'utf8') <= 1024);

  h.clear();
  await h.bot.onWidget(widgetQuery('contract-q'));
  assert.deepEqual(h.calls.map(x => x.method), ['answerWidgetQuery', 'editMessageWidgetData']);
  assert.deepEqual(h.calls[0].data, { widget_query_id: 'contract-q',
    data: JSON.stringify({ ok: true, status: 'accepted' }) });
  assert.deepEqual(Object.keys(h.calls[1].data).sort(), ['chat_data', 'chat_id', 'message_id']);
  assert.equal(h.calls[1].data.chat_id, 123);
  assert.equal(h.calls[1].data.message_id, 77);
});

test('Widget não faz polling automático fora da conversa privada original e visível', async () => {
  const initial = { v: 1, m: 'playing', u: 'pessoa123', t: 'Song', a: 'Artist', list: [] };
  for (const context of [{ chatType: 'group' }, { isPreview: true },
    { isForward: true }, { isActive: false }]) {
    const w = await mountWidget(initial, async () => ({ result: '{"ok":true,"status":"accepted"}' }), context);
    assert.equal(w.requests.length, 0, JSON.stringify(context));
    w.intervals[0]();
    assert.equal(w.requests.length, 0, JSON.stringify(context));
  }
});


test('mensagens sem texto em chat privado recebem instrução Rich explícita', async () => {
  const h = setup();
  await h.bot.onMessage({ from: me, chat: privateChat, sticker: { file_id: 'sticker' } });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'sendRichMessage');
  assert.match(html(h.calls[0]), /Formato não suportado/);
  assert.match(html(h.calls[0]), /\/ajuda/);
});
