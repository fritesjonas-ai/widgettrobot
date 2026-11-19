import { parseMessage } from './actions.js';

// Bot API commands shown by Telegram when a user types "/" in the private chat.
// Use canonical names; aliases remain accepted by parseMessage.
export const PRIVATE_COMMANDS = Object.freeze([
  { command: 'start', description: 'Abrir o bot e ver o card musical' },
  { command: 'setuser', description: 'Vincular seu usuário do Last.fm' },
  { command: 'widget', description: 'Exibir seu card musical Rich' },
  { command: 'now', description: 'Ver a música atual ou última reprodução' },
  { command: 'recentes', description: 'Ver suas cinco últimas músicas' },
  { command: 'perfil', description: 'Consultar sua conta vinculada' },
  { command: 'remover', description: 'Desvincular conta: /remover confirmar' },
  { command: 'ajuda', description: 'Mostrar comandos e instruções' },
]);
export const PRIVATE_SCOPE = Object.freeze({ type: 'all_private_chats' });

// Pre-deploy assertions prevent accidentally publishing commands not handled by the bot.
export function validatePrivateCommands(commands = PRIVATE_COMMANDS) {
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > 100) {
    throw new RangeError('Quantidade de comandos fora dos limites Bot API.');
  }
  const seen = new Set();
  for (const { command, description } of commands) {
    if (typeof command !== 'string' || !/^[a-z0-9_]{1,32}$/.test(command) ||
        seen.has(command) || typeof description !== 'string' ||
        description.length < 1 || description.length > 256) {
      throw new TypeError('Comando ou descrição inválidos/duplicados.');
    }
    seen.add(command);
    if (parseMessage('/' + command).kind === 'unknown') {
      throw new Error('Comando não implementado: ' + command);
    }
  }
  return true;
}

function matching(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((item, index) =>
      item?.command === expected[index].command &&
      item?.description === expected[index].description);
}

// Exactly the documented private-chat scope. No groups or inline keyboards.
export async function configurePrivateCommands(api) {
  validatePrivateCommands();
  const scopes = ['', 'pt'];
  const output = [];
  for (const language_code of scopes) {
    const payload = { scope: PRIVATE_SCOPE, language_code };
    const response = await api.setMyCommands({
      ...payload, commands: PRIVATE_COMMANDS.map(({ command, description }) =>
        ({ command, description })),
    });
    if (response !== true) throw new Error('setMyCommands sem confirmação da Bot API.');
    const readback = await api.getMyCommands(payload);
    if (!matching(readback, PRIVATE_COMMANDS)) {
      throw new Error('getMyCommands não confirmou a lista para ' + (language_code || 'padrão'));
    }
    output.push({ scope: PRIVATE_SCOPE.type, language_code, count: readback.length });
  }
  return output;
}
