/** Telegram message commands and Rich callback identifiers. */
export const ACTION = Object.freeze({
  START:'start',HELP:'help',PROFILE:'profile',NOW:'now',
  RECENT:'recent',WIDGET:'widget',TOPS:'tops',STATS:'stats',
  LOVED:'loved',WEEKLY:'weekly',DISCOVER:'discover',
});
export const TOP_KINDS = Object.freeze({
  tracks:'músicas',albums:'álbuns',artists:'artistas',
});
export const TOP_PERIODS = Object.freeze({
  '7day':'7 dias','1month':'1 mês','3month':'3 meses',
  '6month':'6 meses','12month':'12 meses',overall:'geral',
});
export const WIDGET_ACTION = Object.freeze({
  REFRESH:'refresh',RICH_NOW:'rich_now',
  RICH_RECENT:'rich_recent',PROFILE_HELP:'profile_help',
});
const COMMANDS = Object.freeze({
  '/start':ACTION.START,'/ajuda':ACTION.HELP,'/help':ACTION.HELP,
  '/widget':ACTION.WIDGET,'/painel':ACTION.WIDGET,'/card':ACTION.WIDGET,
  '/now':ACTION.NOW,'/tocando':ACTION.NOW,
  '/recentes':ACTION.RECENT,'/perfil':ACTION.PROFILE,
  '/tops':ACTION.TOPS,'/stats':ACTION.STATS,'/amadas':ACTION.LOVED,
  '/semana':ACTION.WEEKLY,'/descobrir':ACTION.DISCOVER,
});
const CALLBACKS = Object.freeze({
  'wt:widget':ACTION.WIDGET,'wt:now':ACTION.NOW,
  'wt:recent':ACTION.RECENT,'wt:profile':ACTION.PROFILE,
  'wt:help':ACTION.HELP,'wt:tops':ACTION.TOPS,
  'wt:stats':ACTION.STATS,'wt:loved':ACTION.LOVED,
  'wt:weekly':ACTION.WEEKLY,'wt:discover':ACTION.DISCOVER,
});
const WIDGETS = Object.freeze({
  [WIDGET_ACTION.REFRESH]:'refresh',
  [WIDGET_ACTION.RICH_NOW]:ACTION.NOW,
  [WIDGET_ACTION.RICH_RECENT]:ACTION.RECENT,
  [WIDGET_ACTION.PROFILE_HELP]:ACTION.PROFILE,
});
const CATEGORIES = Object.freeze({
  faixas:'tracks',musicas:'tracks','músicas':'tracks',
  tracks:'tracks',artistas:'artists',artists:'artists',
  albuns:'albums','álbuns':'albums',albums:'albums',
});
const PERIOD_ALIASES = Object.freeze({
  '7d':'7day','7day':'7day','1m':'1month','1month':'1month',
  '3m':'3month','3month':'3month','6m':'6month','6month':'6month',
  '12m':'12month','12month':'12month',geral:'overall',
  total:'overall',overall:'overall',
});
export const callbackData = action => 'wt:' + action;
export function fromCallback(raw) {
  const data=String(raw??'');
  if(Object.hasOwn(CALLBACKS,data)) return CALLBACKS[data];
  const parts=data.split(':');
  if(parts.length===4 && parts[0]==='wt' && parts[1]==='tops' &&
      Object.hasOwn(TOP_KINDS,parts[2]) && Object.hasOwn(TOP_PERIODS,parts[3])) {
    return {action:ACTION.TOPS,category:parts[2],period:parts[3]};
  }
  return null;
}
export const fromWidget = data => WIDGETS[String(data??'')] || null;
function topOptions(args) {
  if(args.length>2) return null;
  let category='tracks',period='7day';
  if(args.length) {
    const first=args[0].toLowerCase();
    if(Object.hasOwn(CATEGORIES,first)) category=CATEGORIES[first];
    else if(Object.hasOwn(PERIOD_ALIASES,first)) period=PERIOD_ALIASES[first];
    else return null;
  }
  if(args.length===2) {
    const next=args[1].toLowerCase();
    if(!Object.hasOwn(PERIOD_ALIASES,next) || Object.hasOwn(PERIOD_ALIASES,args[0].toLowerCase())) return null;
    period=PERIOD_ALIASES[next];
  }
  return {kind:'action',action:ACTION.TOPS,category,period};
}
export function parseMessage(text) {
  const [word='',...args]=String(text??'').trim().split(/\s+/);
  const command=word.toLowerCase().split('@')[0];
  if(command==='/setuser') return {kind:'link',username:args.join(' ').trim()};
  if(command==='/remover') return {kind:'unlink',confirmed:args.length===1 && args[0].toLowerCase()==='confirmar'};
  if(command==='/tops') return topOptions(args) || {
    kind:'invalid',usage:'Use /tops [faixas|albuns|artistas] [7d|1m|3m|6m|12m|geral].',
  };
  return Object.hasOwn(COMMANDS,command) ? {kind:'action',action:COMMANDS[command]} : {kind:'unknown'};
}
