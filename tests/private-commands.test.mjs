import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePrivateCommands, configurePrivateCommands,
} from '../tgcloud/lib/domain/private-commands.js';

test('Bot API recebe setMyCommands com escopo privado e verifica os dois idiomas', async () => {
  const requests = [];
  const saved = new Map();
  const api = {
    async setMyCommands(payload) {
      requests.push({ method: 'setMyCommands', payload });
      saved.set(payload.language_code, payload.commands);
      return true;
    },
    async getMyCommands(payload) {
      requests.push({ method: 'getMyCommands', payload });
      return saved.get(payload.language_code);
    },
  };
  const result = await configurePrivateCommands(api);
  assert.deepEqual(result, [
    { scope: 'all_private_chats', language_code: '', count: 17 },
    { scope: 'all_private_chats', language_code: 'pt', count: 17 },
  ]);
  assert.deepEqual(requests.map(x => x.method), [
    'setMyCommands', 'getMyCommands', 'setMyCommands', 'getMyCommands',
  ]);
  for (const request of requests) {
    assert.deepEqual(request.payload.scope, { type: 'all_private_chats' });
  }
  const commands = requests[0].payload.commands;
  const names = commands.map(entry => entry.command);
  // These assertions check the external Bot API payload, not exported constants.
  for (const required of ['start', 'setuser', 'widget', 'tops', 'stats',
    'amadas', 'semana', 'descobrir', 'album', 'letra', 'buscar', 'resumo']) {
    assert.ok(names.includes(required), 'Não publicou /' + required);
  }
  assert.equal(new Set(names).size, names.length, 'Menu enviado com comandos repetidos');
  assert.ok(commands.every(({ command, description }) =>
    /^[a-z0-9_]{1,32}$/.test(command) && typeof description === 'string' &&
    description.trim().length > 0), 'A API recebeu descrições/comandos inválidos');
});

test('falhas ou divergências na resposta oficial não são tratadas como sucesso', async () => {
  await assert.rejects(configurePrivateCommands({
    async setMyCommands() { return false; },
    async getMyCommands() { throw Error('getMyCommands não deveria executar'); },
  }), /sem confirmação/);
  await assert.rejects(configurePrivateCommands({
    async setMyCommands() { return true; },
    async getMyCommands() { return [{ command: 'start', description: 'Divergente' }]; },
  }), /não confirmou/);
  assert.throws(() => validatePrivateCommands([
    ...PRIVATE_COMMANDS, PRIVATE_COMMANDS[0],
  ]), /inválidos\/duplicados/);
});
