/** Wire protocol. A single source for command, callback and Widget action IDs. */
export const ACTION = Object.freeze({
  START: 'start', HELP: 'help', PROFILE: 'profile',
  NOW: 'now', RECENT: 'recent', WIDGET: 'widget',
});

export const WIDGET_ACTION = Object.freeze({
  REFRESH: 'refresh', RICH_NOW: 'rich_now',
  RICH_RECENT: 'rich_recent', PROFILE_HELP: 'profile_help',
});

const COMMANDS = Object.freeze({
  '/start': ACTION.START, '/ajuda': ACTION.HELP, '/help': ACTION.HELP,
  '/widget': ACTION.WIDGET, '/painel': ACTION.WIDGET,
  '/now': ACTION.NOW, '/tocando': ACTION.NOW,
  '/recentes': ACTION.RECENT, '/perfil': ACTION.PROFILE,
});
const CALLBACKS = Object.freeze({
  'wt:widget': ACTION.WIDGET, 'wt:now': ACTION.NOW,
  'wt:recent': ACTION.RECENT, 'wt:profile': ACTION.PROFILE,
  'wt:help': ACTION.HELP,
});
const WIDGETS = Object.freeze({
  [WIDGET_ACTION.REFRESH]: 'refresh',
  [WIDGET_ACTION.RICH_NOW]: ACTION.NOW,
  [WIDGET_ACTION.RICH_RECENT]: ACTION.RECENT,
  [WIDGET_ACTION.PROFILE_HELP]: ACTION.PROFILE,
});

export const callbackData = action => `wt:${action}`;
export const fromCallback = data => CALLBACKS[String(data ?? '')] || null;
export const fromWidget = data => WIDGETS[String(data ?? '')] || null;

export function parseMessage(text) {
  const [word = '', ...args] = String(text ?? '').trim().split(/\s+/);
  const command = word.toLowerCase().split('@')[0];
  if (command === '/setuser') return { kind: 'link', username: args.join(' ').trim() };
  if (command === '/remover') return { kind: 'unlink', confirmed: args.length === 1 && args[0].toLowerCase() === 'confirmar' };
  return COMMANDS[command] ? { kind: 'action', action: COMMANDS[command] } : { kind: 'unknown' };
}
