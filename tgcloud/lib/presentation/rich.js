import { escapeHtml, profileUrl } from '../domain/format.js';
import { ACTION, TOP_KINDS, TOP_PERIODS, callbackData } from '../domain/actions.js';

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
  const cover = state.image && (mode === 'playing' || mode === 'last')
    ? '<figure><img src="' + escapeHtml(state.image) + '"/></figure>' : '';

  let details = '';
  if (mode === 'playing' || mode === 'last') {
    const title = escapeHtml(state.title || 'Música desconhecida');
    const artist = escapeHtml(state.artist || 'Artista desconhecido');
    details = '<h1><b>' + title + '</b></h1>' +
      (state.album ? '<p>' + title + ' — ' + escapeHtml(state.album) + '</p>' : '') +
      '<h2><i>' + artist + '</i></h2>';
  } else if (mode === 'error') {
    details = '<p>' + escapeHtml(state.error || 'Não foi possível consultar o Last.fm.') + '</p>';
  } else {
    details = '<p>Nenhuma reprodução recente encontrada.</p>';
  }

  const actions = row(
    button('Atualizar', ACTION.WIDGET, 'primary'),
    button('Recentes', ACTION.RECENT),
  ) + INSIGHT_NAV + FORK_NAV +
    row('<tg-button type="url" url="' + profileUrl(user) + '">Perfil Last.fm</tg-button>');

  return cover + details + actions;
}

const periodButton = (title,category,period) =>
  '<tg-button type="callback_data" data="wt:tops:' + category + ':' + period + '">' + title + '</tg-button>';
const figure = image => image ? '<figure><img src="' + escapeHtml(image) + '"/></figure>' : '';
const number = value => String(Number(value)||0).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const ranked = (items,kind,limit=5) => {
  if(!items?.length) return '<p>Nenhum registro neste período.</p>';
  return '<ol>' + items.slice(0,limit).map(item => {
    const name=kind==='artists' ? item.artist :
      kind==='albums' ? item.artist+' — '+item.album : item.artist+' — '+item.title;
    return '<li>' + escapeHtml(name) +
      (Number.isFinite(item.playcount) ? ' · <b>' + number(item.playcount) + '</b>' : '') +
      '</li>';
  }).join('') + '</ol>';
};
const INSIGHT_NAV = row(
  button('Tops',ACTION.TOPS),button('Stats',ACTION.STATS),button('Amadas',ACTION.LOVED),
) + row(button('Semana',ACTION.WEEKLY),button('Descobrir',ACTION.DISCOVER));
const FORK_NAV = row(button('Álbum',ACTION.ALBUM),button('Letra',ACTION.LYRICS)) +
  row(button('Resumo',ACTION.SUMMARY),button('Buscar',ACTION.SEARCH));

function topsView({kind,period,items,cover}) {
  return '<h3>Top '+TOP_KINDS[kind]+' · '+TOP_PERIODS[period]+'</h3>' + figure(cover) +
    ranked(items,kind) +
    row(periodButton('Músicas','tracks',period),periodButton('Álbuns','albums',period),periodButton('Artistas','artists',period)) +
    row(periodButton('7d',kind,'7day'),periodButton('1m',kind,'1month'),periodButton('3m',kind,'3month')) +
    row(periodButton('6m',kind,'6month'),periodButton('12m',kind,'12month'),periodButton('Geral',kind,'overall')) +
    INSIGHT_NAV + FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
function statsView(user,stats,cover='') {
  const year=stats.registered ? new Date(stats.registered*1000).getUTCFullYear() : 0;
  const fields=[
    '<p><b>'+number(stats.scrobbles)+'</b> scrobbles</p>',
    ...(stats.artists!==null?['<p>'+number(stats.artists)+' artistas</p>']:[]),
    ...(stats.albums!==null?['<p>'+number(stats.albums)+' álbuns</p>']:[]),
    ...(stats.tracks!==null?['<p>'+number(stats.tracks)+' músicas</p>']:[]),
    ...(year>=2002 && year<=2100?['<p>Desde '+year+'</p>']:[]),
  ];
  return '<h3>Estatísticas · @'+escapeHtml(user)+'</h3>'+figure(cover)+fields.join('')+
    INSIGHT_NAV + FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
function lovedView(user,tracks,cover='') {
  const list=tracks.length?'<ol>'+tracks.slice(0,5).map(t =>
    '<li>'+escapeHtml(t.artist)+' — <b>'+escapeHtml(t.title)+'</b></li>').join('')+'</ol>'
    :'<p>Nenhuma música amada encontrada.</p>';
  return '<h3>Músicas amadas</h3>'+figure(cover)+list+
    INSIGHT_NAV + FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
function weeklyView({tracks,artists,albums,cover}) {
  return '<h3>Seus últimos 7 dias</h3>'+figure(cover)+
    '<h4>Músicas</h4>'+ranked(tracks,'tracks',3)+
    '<h4>Artistas</h4>'+ranked(artists,'artists',3)+
    '<h4>Álbuns</h4>'+ranked(albums,'albums',3)+
    INSIGHT_NAV + FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
function discoverView({seed,result,cover}) {
  const items=result.items||[];
  const list=items.length?'<ol>'+items.slice(0,5).map(item =>
    '<li>'+escapeHtml(result.kind==='artists'?item.artist:item.artist+' — '+item.title)+'</li>').join('')+'</ol>'
    :'<p>Sem recomendações disponíveis para esta reprodução.</p>';
  return '<h3>Descobrir '+(result.kind==='artists'?'artistas':'músicas')+'</h3>'+
    '<p>Com base em '+escapeHtml(seed.artist)+' — '+escapeHtml(seed.title)+'</p>'+
    figure(cover)+list+
    INSIGHT_NAV + FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}

function albumView(track,info,cover) {
  const album=info?.title||track.album, artist=info?.artist||track.artist;
  const tracks=info?.tracks||[];
  return figure(cover) + '<h2>'+escapeHtml(album)+'</h2>'+
    '<p><i>'+escapeHtml(artist)+'</i></p>'+
    (tracks.length?'<h3>Faixas</h3><ol>'+tracks.map(t=>'<li>'+escapeHtml(t)+'</li>').join('')+'</ol>':
      '<p>Lista de faixas indisponível no Last.fm.</p>')+
    FORK_NAV + INSIGHT_NAV + row(button('Card musical',ACTION.WIDGET));
}
function lyricsView(track,preview,cover) {
  const status=preview?.status;
  const detail=status==='preview'
    ? '<blockquote>'+escapeHtml(preview.excerpt)+'…</blockquote><p>Trecho de até dez palavras.</p>'
    : status==='instrumental'?'<p>Faixa instrumental.</p>'
    :status==='missing'?'<p>Trecho não encontrado no LRCLIB.</p>'
    :'<p>Trecho indisponível no momento.</p>';
  return figure(cover)+'<h2>'+escapeHtml(track.title)+'</h2>'+
    '<p><i>'+escapeHtml(track.artist)+'</i></p>'+detail+
    FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
function searchView(term,tracks,cover) {
  const url=(item)=>'https://www.last.fm/music/'+encodeURIComponent(item.artist)+
    '/_/'+encodeURIComponent(item.title);
  const results=tracks.length?'<ol>'+tracks.map(item=>
    '<li><a href="'+escapeHtml(url(item))+'">'+escapeHtml(item.title)+'</a> — '+
    escapeHtml(item.artist)+'</li>').join('')+'</ol>'
    :'<p>Nenhuma música encontrada.</p>';
  return figure(cover)+'<h2>Buscar: '+escapeHtml(term)+'</h2>'+results+
    FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
function summaryView(user) {
  return '<h2>Meu resumo · @'+escapeHtml(user)+'</h2>'+
    '<p>Escolha um período para ver as faixas mais ouvidas:</p>'+
    row(periodButton('Semana','tracks','7day'),periodButton('Mês','tracks','1month'))+
    row(periodButton('3 meses','tracks','3month'),periodButton('Geral','tracks','overall'))+
    INSIGHT_NAV + FORK_NAV + row(button('Card musical',ACTION.WIDGET));
}
export const richViews = Object.freeze({
  welcome(user = '') {
    return `<h2>widgettrobot</h2><p>Seu Last.fm em Rich Messages no Telegram.</p>` +
      (user ? `<p>Perfil atual: <a href="${profileUrl(user)}">@${escapeHtml(user)}</a>.</p>` :
        `<blockquote>Para começar, envie <code>/setuser seu_usuario_lastfm</code>.</blockquote>`) +
      '<p>Explore: <code>/tops faixas 7d</code>, <code>/stats</code>, <code>/amadas</code>, ' +
      '<code>/semana</code>, <code>/descobrir</code>, <code>/album</code>, '+
      '<code>/letra</code>, <code>/buscar termo</code> e <code>/resumo</code>.</p>' +
      INSIGHT_NAV + FORK_NAV + MENU;
  },
  profile(user = '') {
    return `<h3>Meu perfil Last.fm</h3>` +
      (user ? `<p>Conectado: <a href="${profileUrl(user)}"><b>@${escapeHtml(user)}</b></a>.</p>` :
        `<p>Nenhum usuário Last.fm vinculado.</p>`) +
      `<p>Para alterar, envie <code>/setuser usuario</code>. Para desvincular, envie <code>/remover confirmar</code>.</p>` +
      INSIGHT_NAV + FORK_NAV + row(button('Card musical', ACTION.WIDGET, 'primary'), button('Ajuda', ACTION.HELP));
  },
  musicCard,
  current: musicCard,
  tops: topsView,
  stats: statsView,
  loved: lovedView,
  weekly: weeklyView,
  discover: discoverView,
  album: albumView,
  lyrics: lyricsView,
  searchResults: searchView,
  summary: summaryView,
  searchHelp() {
    return '<h3>Buscar música</h3><p>Envie <code>/buscar nome da música ou artista</code>.</p>'+
      FORK_NAV + row(button('Card musical',ACTION.WIDGET));
  },
  recent(user, tracks) {
    const list = tracks.slice(0, 5).map(t => `<li>${escapeHtml(t.artist)} — <b>${escapeHtml(t.title)}</b>${t.nowplaying ? ' (tocando agora)' : ''}</li>`).join('');
    return `<h3>Últimas músicas</h3><p>Perfil <a href="${profileUrl(user)}">@${escapeHtml(user)}</a></p>` +
      (list ? `<ol>${list}</ol>` : '<p>Nenhuma reprodução recente encontrada.</p>') + INSIGHT_NAV + FORK_NAV + MENU;
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
