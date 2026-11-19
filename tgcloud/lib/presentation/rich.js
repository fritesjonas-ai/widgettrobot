import { escapeHtml, profileUrl } from '../domain/format.js';
import { ACTION, callbackData } from '../domain/actions.js';

const button = (title, action, style = '') =>
  `<tg-button type="callback_data" data="${callbackData(action)}"${style ? ` style="${style}"` : ''}>${title}</tg-button>`;
const row = (...buttons) => `<tg-button-row>${buttons.join('')}</tg-button-row>`;

const MENU = row(button('Painel interativo', ACTION.WIDGET, 'primary'), button('Tocando agora', ACTION.NOW)) +
  row(button('Últimas músicas', ACTION.RECENT), button('Minha conta', ACTION.PROFILE));

export const richViews = Object.freeze({
  welcome(user = '') {
    return `<h2>widgettrobot</h2><p>Seu Last.fm em Rich Messages e Widgets, dentro do Telegram.</p>` +
      (user ? `<p>Perfil atual: <a href="${profileUrl(user)}">@${escapeHtml(user)}</a>.</p>` :
        `<blockquote>Para começar, envie <code>/setuser seu_usuario_lastfm</code>.</blockquote>`) +
      MENU + `<footer>O Widget acompanha sua escuta enquanto estiver aberto.</footer>`;
  },
  profile(user = '') {
    return `<h3>Meu perfil Last.fm</h3>` +
      (user ? `<p>Conectado: <a href="${profileUrl(user)}"><b>@${escapeHtml(user)}</b></a>.</p>` :
        `<p>Nenhum usuário Last.fm vinculado.</p>`) +
      `<p>Para alterar, envie <code>/setuser usuario</code>. Para desvincular, envie <code>/remover confirmar</code>.</p>` +
      row(button('Abrir painel', ACTION.WIDGET, 'primary'), button('Ajuda', ACTION.HELP));
  },
  current(state) {
    const label = state.mode === 'playing' ? 'Tocando agora' :
      state.mode === 'last' ? 'Última reprodução' :
      state.mode === 'error' ? 'Erro no Last.fm' : 'Sem reproduções';
    const body = `<h3>${label}</h3>` +
      (state.mode === 'error' ? `<p>${escapeHtml(state.error || 'Tente novamente.')}</p>` :
        `<p><b>${escapeHtml(state.title || 'Nenhuma música encontrada')}</b></p>` +
        `<p>${escapeHtml(state.artist || '')}${state.album ? ` — ${escapeHtml(state.album)}` : ''}</p>`) +
      `<footer><a href="${profileUrl(state.user || '')}">@${escapeHtml(state.user || '')} no Last.fm</a></footer>` + MENU;
    return state.image && state.mode !== 'error'
      ? `<img src="${escapeHtml(state.image)}"/>` + body
      : body;
  },
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
