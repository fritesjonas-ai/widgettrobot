import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotService } from '../tgcloud/lib/application/bot-service.js';
import { createLastfmClient } from '../tgcloud/lib/infrastructure/lastfm-client.js';
import { createTelegramMessenger } from '../tgcloud/lib/infrastructure/telegram-messenger.js';
import { richViews } from '../tgcloud/lib/presentation/rich.js';

const me = { id: 123, is_bot: false };
const chat = { id: 123, type: 'private' };
const message = text => ({ text, from: me, chat });
const callback = (data, from = me) => ({ id: 'query-1', data, from, message: { chat } });
const song = (name = 'Starlight', artist = 'Muse', playing = true,
  image = 'https://lastfm.freetls.fastly.net/i/u/300x300/test-art.jpg') => ({
  name, artist: { '#text': artist }, album: { '#text': 'Black Holes' },
  ...(playing ? { '@attr': { nowplaying: 'true' } } : { date: { uts: '1731957000' } }),
  ...(image ? { image: [{ size: 'extralarge', '#text': image }] } : {}),
});
const payload = (...tracks) => ({ recenttracks: { track: tracks } });
const html = call => call.data.rich_message.html;
const apiError = (code, method, description = '') => Object.assign(new Error(description || 'API error'), {
  code, method, description,
});
function setup(initial = payload(song())) {
  const stored = new Map(), calls = [], requests = [], activity = [], logs = [];
  const fails = {};
  let current = initial, status = 200, networkFailure = false;
  let albumInfo = { album: { image: [] } }, trackInfo = { track: { album: { image: [] } } };
  const logger = { error(...values) { logs.push(values); } };
  const api = {
    async sendRichMessage(data) {
      activity.push('sendRichMessage');
      calls.push({ method: 'sendRichMessage', data });
      if (fails.sendRichMessage) throw fails.sendRichMessage;
      return { message_id: 91 };
    },
    async answerCallbackQuery(data) {
      activity.push('answerCallbackQuery');
      calls.push({ method: 'answerCallbackQuery', data });
      return true;
    },
    async answerWidgetQuery() { throw Error('No new widgets should be sent'); },
    async editMessageWidgetData() { throw Error('Legacy-only endpoint'); },
    async sendWidget() { throw Error('sendWidget must never be invoked'); },
  };
  const profiles = {
    async get(id) { activity.push('profiles.get'); if (fails.get) throw fails.get; return stored.get(id) ?? null; },
    async save(id, user) { activity.push('profiles.save'); if (fails.save) throw fails.save; stored.set(id, user); },
    async remove(id) { activity.push('profiles.remove'); if (fails.remove) throw fails.remove; stored.delete(id); },
  };
  const lastfm = createLastfmClient({
    apiKey: 'test-only-key',
    request: async url => {
      activity.push('lastfm.fetch');
      requests.push(new URL(url));
      if (networkFailure) throw Error('network error');
      const method = new URL(url).searchParams.get('method');
      return {
        status, ok: status >= 200 && status < 300,
        json: async () => method === 'album.getInfo' ? albumInfo :
          method === 'track.getInfo' ? trackInfo : current,
      };
    },
  });
  const bot = createBotService({ profiles, lastfm,
    messenger: createTelegramMessenger({ api, logger }), views: richViews, logger });
  return { bot, calls, requests, activity, logs, fails, stored,
    setPayload(x) { current = x; },
    setAlbumInfo(x) { albumInfo = x; },
    setTrackInfo(x) { trackInfo = x; },
    setStatus(x) { status = x; },
    setNetworkFailure(x) { networkFailure = x; },
    clear() { calls.length = 0; requests.length = 0; activity.length = 0; logs.length = 0; },
  };
}
async function link(h, username = 'pessoa123') {
  await h.bot.onMessage(message('/setuser ' + username));
}

test('card musical usa apenas capa, título H1 bold, música — álbum e artista H2 itálico', () => {
  const rich = richViews.musicCard({
    user: 'pessoa123', mode: 'playing',
    image: 'https://lastfm.freetls.fastly.net/i/u/300x300/demo.jpg',
    title: 'A & B', artist: 'Artista <X>', album: 'Álbum & Outros',
  });
  const cover = '<figure><img src="https://lastfm.freetls.fastly.net/i/u/300x300/demo.jpg"/></figure>';
  assert.ok(rich.startsWith(cover + '<h1><b>A &amp; B</b></h1>'));
  assert.match(rich, /<p>A &amp; B — Álbum &amp; Outros<\/p>/);
  assert.match(rich, /<h2><i>Artista &lt;X&gt;<\/i><\/h2>/);
  assert.equal((rich.match(/<h1>/g) || []).length, 1);
  assert.equal((rich.match(/<h2>/g) || []).length, 1);
  assert.doesNotMatch(rich, /<h3>|figcaption|<footer>|TOCANDO AGORA|ÚLTIMA REPRODUÇÃO|inline_keyboard|reply_markup/);
  for (const action of ['tops', 'stats', 'loved', 'weekly', 'discover']) {
    assert.match(rich, new RegExp('data="wt:' + action + '"'));
  }
  assert.equal((rich.match(/<tg-button /g) || []).length, 12);
});

test('card sem álbum omite a linha música — álbum; estados vazios e de erro continuam legíveis', () => {
  const base = { user: 'pessoa123', title: 'Faixa', artist: 'Banda', album: '', image: '' };
  const playing = richViews.musicCard({ ...base, mode: 'playing' });
  assert.match(playing, /<h1><b>Faixa<\/b><\/h1><h2><i>Banda<\/i><\/h2>/);
  assert.doesNotMatch(playing, / — |<img/);
  const empty = richViews.musicCard({ ...base, mode: 'empty' });
  assert.match(empty, /Nenhuma reprodução recente encontrada/);
  assert.doesNotMatch(empty, /Faixa|Banda/);
  const error = richViews.musicCard({ ...base, mode: 'error', error: 'Last.fm indisponível' });
  assert.match(error, /Last.fm indisponível/);
  assert.doesNotMatch(error, /Faixa|Banda/);
});

test('/start sem perfil fornece instrução Rich e não chama Last.fm nem Widget', async () => {
  const h = setup();
  await h.bot.onMessage(message('/start'));
  assert.deepEqual(h.calls.map(x => x.method), ['sendRichMessage']);
  assert.match(html(h.calls[0]), /\/setuser/);
  assert.equal(h.requests.length, 0);
  assert.ok(!Object.hasOwn(h.calls[0].data, 'reply_markup'));
});

test('/setuser grava perfil e envia card Rich contendo música e ações', async () => {
  const h = setup();
  await link(h);
  assert.equal(h.stored.get(123), 'pessoa123');
  assert.deepEqual(h.calls.map(x => x.method), ['sendRichMessage']);
  assert.equal(h.requests.length, 2);
  const card = html(h.calls[0]);
  assert.match(card, /<h1><b>Starlight<\/b><\/h1>/);
  assert.match(card, /<p>Starlight — Black Holes<\/p>/);
  assert.match(card, /<h2><i>Muse<\/i><\/h2>/);
  assert.doesNotMatch(card, /TOCANDO AGORA|ÚLTIMA REPRODUÇÃO/);
  assert.match(card, /<tg-button type="callback_data" data="wt:widget" style="primary">Atualizar<\/tg-button>/);
  assert.match(card, /<tg-button type="url" url="https:\/\/www\.last\.fm\/user\/pessoa123">Perfil Last.fm<\/tg-button>/);
  assert.doesNotMatch(card, /Card musical|Capa do álbum|Outras reproduções recentes|figcaption|<footer>|@pessoa123/);
  assert.equal((card.match(/<tg-button /g) || []).length, 12);
  for (const action of ['tops','stats','loved','weekly','discover']) {
    assert.match(card, new RegExp('data="wt:' + action + '"'));
  }
  assert.doesNotMatch(card, /<html|<script|inline_keyboard|sendWidget/i);
});

test('/widget, /painel e /card geram apenas Rich Message de música', async () => {
  const h = setup(); await link(h);
  for (const cmd of ['/widget', '/painel', '/card']) {
    h.clear();
    await h.bot.onMessage(message(cmd));
    assert.deepEqual(h.calls.map(x => x.method), ['sendRichMessage']);
    assert.match(html(h.calls[0]), /<h1><b>Starlight<\/b><\/h1>/);
    assert.match(html(h.calls[0]), /Starlight/);
  }
});

test('/start com perfil envia um único card Rich', async () => {
  const h = setup(); await link(h); h.clear();
  await h.bot.onMessage(message('/start'));
  assert.deepEqual(h.calls.map(x => x.method), ['sendRichMessage']);
  assert.match(html(h.calls[0]), /Starlight/);
});

test('/widget sem perfil dá instrução Rich sem falsa música', async () => {
  const h = setup();
  await h.bot.onMessage(message('/widget'));
  assert.deepEqual(h.calls.map(x => x.method), ['sendRichMessage']);
  assert.equal(h.requests.length, 0);
  assert.match(html(h.calls[0]), /Last.fm não configurado/);
  assert.match(html(h.calls[0]), /\/setuser/);
});

test('botão Atualizar recebe ACK antes do Last.fm e envia novo card', async () => {
  const h = setup(); await link(h); h.clear();
  h.setPayload(payload(song('Faixa nova', 'Artista novo')));
  await h.bot.onCallback(callback('wt:widget'));
  assert.deepEqual(h.activity, ['answerCallbackQuery', 'profiles.get', 'lastfm.fetch', 'sendRichMessage']);
  assert.match(html(h.calls[1]), /Faixa nova/);
  assert.equal(h.calls[0].data.callback_query_id, 'query-1');
});

test('callback de outro usuário não consulta Last.fm nem envia card', async () => {
  const h = setup(); await link(h); h.clear();
  await h.bot.onCallback(callback('wt:widget', { id: 999 }));
  assert.deepEqual(h.calls.map(x => x.method), ['answerCallbackQuery']);
  assert.match(h.calls[0].data.text, /indisponível/);
  assert.equal(h.requests.length, 0);
});

test('capa válida é incorporada em bloco Rich figure, sem teclado inline', async () => {
  const cover = 'https://lastfm.freetls.fastly.net/i/u/300x300/demo.jpg';
  const h = setup(payload(song('With Cover', 'Artist', true, cover)));
  await link(h);
  assert.match(html(h.calls[0]), /<figure><img src="https:\/\/lastfm\.freetls\.fastly\.net\/i\/u\/300x300\/demo\.jpg"\/><\/figure>/);
  assert.doesNotMatch(html(h.calls[0]), /figcaption|Capa do álbum/);
  assert.deepEqual(Object.keys(h.calls[0].data).sort(), ['chat_id', 'rich_message']);
});

test('quando recentes não traz capa, album.getInfo fornece a imagem no card Rich', async () => {
  const h = setup(payload(song('Believe', 'Cher', true, '')));
  const cover = 'https://lastfm.freetls.fastly.net/i/u/300x300/believe.jpg';
  h.setAlbumInfo({ album: { image: [
    { size: 'extralarge', '#text': cover },
    { size: 'mega', '#text': 'https://example.com/not-trusted.jpg' },
  ] } });
  await link(h);
  assert.deepEqual(h.requests.map(x => x.searchParams.get('method')),
    ['user.getRecentTracks', 'user.getRecentTracks', 'album.getInfo']);
  assert.equal(h.requests[2].searchParams.get('album'), 'Black Holes');
  assert.match(html(h.calls[0]), /<img src="https:\/\/lastfm\.freetls\.fastly\.net\/i\/u\/300x300\/believe\.jpg"\/>/);
  assert.doesNotMatch(html(h.calls[0]), /figcaption|Capa do álbum/);
});

test('track.getInfo recupera a capa quando album.getInfo não tem imagem', async () => {
  const h = setup(payload(song('Believe', 'Cher', true, '')));
  const cover = 'https://lastfm.freetls.fastly.net/i/u/300x300/trackinfo.jpg';
  h.setTrackInfo({ track: { album: { image: [
    { size: 'large', '#text': cover },
  ] } } });
  await link(h);
  assert.deepEqual(h.requests.map(x => x.searchParams.get('method')),
    ['user.getRecentTracks', 'user.getRecentTracks', 'album.getInfo', 'track.getInfo']);
  assert.equal(h.requests.at(-1).searchParams.get('track'), 'Believe');
  assert.match(html(h.calls[0]), /trackinfo\.jpg/);
});

test('entrada de capa vazia ou placeholder é ignorada; imagens pequenas válidas são aceitas', async () => {
  const h = setup(payload(song('No Image', 'Artist', true, '')));
  h.setAlbumInfo({ album: { image: [
    { size: 'extralarge', '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png' },
    { size: 'medium', '#text': 'https://lastfm.freetls.fastly.net/i/u/64s/realcover.png' },
  ] } });
  await link(h);
  assert.match(html(h.calls[0]), /realcover\.png/);
  assert.doesNotMatch(html(h.calls[0]), /2a96cbd8b46e442fc41c2b86b821562f/);
});

test('sem capa na API o card mantém a música sem texto redundante nem imagem inventada', async () => {
  const h = setup(payload(song('No Image', 'Artist', true, '')));
  await link(h);
  assert.match(html(h.calls[0]), /No Image/);
  assert.doesNotMatch(html(h.calls[0]), /Capa não disponível/);
  assert.doesNotMatch(html(h.calls[0]), /<img/);
});

test('erro no método de capa não oculta música nem vaza a chave Last.fm', async () => {
  const h = setup(payload(song('No Image', 'Artist', true, '')));
  h.setAlbumInfo({ error: 29, message: 'Rate limit' });
  await link(h);
  assert.match(html(h.calls[0]), /No Image/);
  assert.doesNotMatch(html(h.calls[0]), /Capa não disponível/);
  assert.ok(h.logs.some(entry => entry[1].operation === 'lastfm-cover' &&
    entry[1].code === 29));
  assert.doesNotMatch(JSON.stringify(h.calls) + JSON.stringify(h.logs), /test-only-key/);
});

test('capa externa não aprovada e metadados hostis não entram como HTML executável', async () => {
  const h = setup(payload(song('<script>alert(1)</script>', 'A & B', true,
    'https://example.com/evil.png')));
  await link(h);
  const card = html(h.calls[0]);
  assert.match(card, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(card, /A &amp; B/);
  assert.doesNotMatch(card, /<script>|<img/);
});

test('/now distingue a última reprodução, sem afirmar que está tocando', async () => {
  const h = setup(payload(song('Yesterday', 'Muse', false))); await link(h); h.clear();
  await h.bot.onMessage(message('/now'));
  assert.match(html(h.calls[0]), /<h1><b>Yesterday<\/b><\/h1>/);
  assert.match(html(h.calls[0]), /<p>Yesterday — Black Holes<\/p>/);
  assert.match(html(h.calls[0]), /<h2><i>Muse<\/i><\/h2>/);
  assert.doesNotMatch(html(h.calls[0]), /TOCANDO AGORA|ÚLTIMA REPRODUÇÃO/);
});

test('/widget mostra erro do Last.fm como card de erro, sem inventar música', async () => {
  const h = setup(); await link(h); h.clear();
  h.setPayload({ error: 29, message: 'Rate limit exceeded' });
  await h.bot.onMessage(message('/widget'));
  assert.deepEqual(h.calls.map(c => c.method), ['sendRichMessage']);
  assert.doesNotMatch(html(h.calls[0]), /<h1>|<h2>|<img|ERRO NO LAST\.FM/);
  assert.match(html(h.calls[0]), /limitou as consultas/);
  assert.doesNotMatch(html(h.calls[0]), /Starlight/);
});

test('usuário Last.fm inexistente não substitui perfil armazenado', async () => {
  const h = setup(); await link(h); h.clear();
  h.setPayload({ error: 6, message: 'User not found' });
  await h.bot.onMessage(message('/setuser fantasma'));
  assert.equal(h.stored.get(123), 'pessoa123');
  assert.match(html(h.calls[0]), /Usuário do Last.fm inválido ou inexistente/);
});

test('falha de gravação preserva perfil e não informa vínculo concluído', async () => {
  const h = setup(); await link(h); h.clear();
  h.fails.save = Error('SQLite locked');
  await h.bot.onMessage(message('/setuser outra_conta'));
  assert.equal(h.stored.get(123), 'pessoa123');
  assert.match(html(h.calls[0]), /Não foi possível concluir/);
  assert.doesNotMatch(html(h.calls[0]), /Card musical/);
});

test('erro Telegram 429 é propagado sem retry silencioso', async () => {
  const h = setup(); await link(h); h.clear();
  h.fails.sendRichMessage = apiError(429, 'sendRichMessage', 'Rate limited');
  await assert.rejects(h.bot.onMessage(message('/widget')), e => e.code === 429);
  assert.deepEqual(h.calls.map(c => c.method), ['sendRichMessage']);
});

test('/recentes conserva cinco faixas, escapando texto externo', async () => {
  const h = setup(payload(song('One & Only'), song('Two'), song('Three'), song('Four'),
    song('Five'), song('Six')));
  await link(h); h.clear();
  await h.bot.onMessage(message('/recentes'));
  const msg = html(h.calls[0]);
  assert.equal((msg.match(/<li>/g) || []).length, 5);
  assert.match(msg, /One &amp; Only/);
  assert.doesNotMatch(msg, /Six/);
});

test('/remover confirmar apaga perfil e /widget volta às instruções', async () => {
  const h = setup(); await link(h); h.clear();
  await h.bot.onMessage(message('/remover confirmar'));
  assert.equal(h.stored.has(123), false);
  h.clear();
  await h.bot.onMessage(message('/widget'));
  assert.match(html(h.calls[0]), /Last.fm não configurado/);
});

test('rejeição Last.fm HTTP 503 não vira card de lista vazia', async () => {
  const h = setup(); await link(h); h.clear();
  h.setStatus(503);
  await h.bot.onMessage(message('/widget'));
  assert.match(html(h.calls[0]), /temporariamente indisponível/);
  assert.doesNotMatch(html(h.calls[0]), /Nenhuma reprodução recente encontrada/);
});

test('mensagem sem texto em chat privado recebe orientação Rich', async () => {
  const h = setup();
  await h.bot.onMessage({ chat, from: me, sticker: { file_id: 'abc' } });
  assert.deepEqual(h.calls.map(c => c.method), ['sendRichMessage']);
  assert.match(html(h.calls[0]), /Formato não suportado/);
});
