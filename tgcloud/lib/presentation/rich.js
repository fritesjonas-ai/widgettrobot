import { escapeHtml, profileUrl } from '../domain/format.js';
import { ACTION, callbackData } from '../domain/actions.js';

const button = (title, action, style = '') =>
  `<tg-button type="callback_data" data="${callbackData(action)}"${style ? ` style="${style}"` : ''}>${title}</tg-button>`;
const row = (...buttons) => `<tg-button-row>${buttons.join('')}</tg-button-row>`;

const MENU = row(button('Atualizar card', ACTION.WIDGET, 'primary'), button('Últimas músicas', ACTION.RECENT)) +
  row(button('Meu perfil', ACTION.PROFILE), button('Ajuda', ACTION.HELP));

function musicCard(state) {
  const user = state.user || '';
  if (!user) return '<h3>Last.fm não configurado</h3>' +
    '<p>Envie <code>/setuser usuario</code> para criar seu card musical.</p>';

  const mode = state.mode || 'empty';
  const label = mode === 'playing' ? '● TOCANDO AGORA' :
    mode === 'last' ? 'ÚLTIMA REPRODUÇÃO' :
    mode === 'error' ? 'ERRO NO LAST.FM' : 'SEM REPRODUÇÕES';

  const cover = state.image && (mode === 'playing' || mode === 'last')
    ? '<figure><img src="' + escapeHtml(state.image) + '"/></figure>' : '';
  const details = mode === 'error'
    ? '<p>' + escapeHtml(state.error || 'Não foi possível consultar o Last.fm.') + '</p>'
    : mode === 'playing' || mode === 'last'
      ? '<h3>' + escapeHtml(state.title || 'Música desconhecida') + '</h3>' +
        '<p><b>' + escapeHtml(state.artist || 'Artista desconhecido') + '</b></p>' +
        (state.album ? '<p>' + escapeHtml(state.album) + '</p>' : '')
      : '';

  const actions = row(
    button('Atualizar', ACTION.WIDGET, 'primary'),
    button('Recentes', ACTION.RECENT),
  ) + row('<tg-button type="url" url="' + profileUrl(user) + '">Perfil Last.fm</tg-button>');

  return '<p><b>' + label + '</b></p>' + cover + details + actions;
}

export const richViews = Object.freeze({
  welcome(user = '') {
    return `<h2>widgettrobot</h2><p>Seu Last.fm em Rich Messages no Telegram.</p>` +
      (user ? `<p>Perfil atual: <a href="${profileUrl(user)}">@${escapeHtml(user)}</a>.</p>` :
        `<blockquote>Para começar, envie <code>/setuser seu_usuario_lastfm</code>.</blockquote>`) +
      MENU + `<footer>O card mostra a última informação disponível no Last.fm.</footer>`;
  },
  profile(user = '') {
    return `<h3>Meu perfil Last.fm</h3>` +
      (user ? `<p>Conectado: <a href="${profileUrl(user)}"><b>@${escapeHtml(user)}</b></a>.</p>` :
        `<p>Nenhum usuário Last.fm vinculado.</p>`) +
      `<p>Para alterar, envie <code>/setuser usuario</code>. Para desvincular, envie <code>/remover confirmar</code>.</p>` +
      row(button('Card musical', ACTION.WIDGET, 'primary'), button('Ajuda', ACTION.HELP));
  },
  musicCard,
  current: musicCard,
  recent(user, tracks) {
    const list = tracks.slice(0, 5).map(t => `<li>${escapeHtml(t.artist)} — <b>${escapeHtml(t.title)}</b>${t.nowplaying ? ' (tocando agora)' : ''}</li>`).join('');
    return `<h3>Últimas músicas</h3><p>Perfil <a href="${profileUrl(user)}">@${escapeHtml(user)}</a></p>` +
      (list ? `<ol>${list}</ol>` : '<p>Nenhuma reprodução recente encontrada.</p>') + MENU;
  },
  error(title, detail) {
    return `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>` + MENU;
  },
  linked(user) {
    return `<h3>Perfil vinculado</h3><p><a href="${profileUrl(user)}">@${escapeHtml(user)}</a> está conectado.</p>` +
      '<p>Abra o painel ou consulte sua música atual.</p>' + MENU;
  },
  unlinkHelp() {
    return '<h3>Desvincular Last.fm</h3><p>Envie <code>/remover confirmar</code> para apagar a associação deste Telegram com seu Last.fm.</p>' + MENU;
  },
  unlinked() { return '<h3>Perfil desvinculado</h3><p>A associação com o Last.fm foi removida.</p>' + MENU; },
});
