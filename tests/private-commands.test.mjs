import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIVATE_COMMANDS, PRIVATE_SCOPE, validatePrivateCommands, configurePrivateCommands,
} from '../tgcloud/lib/domain/private-commands.js';
import { parseMessage } from '../tgcloud/lib/domain/actions.js';

test('menu privado contém comandos implementados, descrições e nenhum alias duplicado', () => {
  assert.equal(validatePrivateCommands(), true);
  assert.deepEqual(PRIVATE_COMMANDS.map(x => x.command), [
    'start', 'setuser', 'widget', 'now', 'recentes', 'tops', 'stats', 'amadas', 'semana', 'descobrir',
    'perfil', 'remover', 'ajuda',
  ]);
  assert.deepEqual(PRIVATE_SCOPE, { type: 'all_private_chats' });
  assert.equal(parseMessage('/setuser').kind, 'link');
  assert.equal(parseMessage('/remover').kind, 'unlink');
  assert.equal(parseMessage('/painel').action, parseMessage('/widget').action);
  assert.equal(parseMessage('/card').action, parseMessage('/widget').action);
  assert.equal(parseMessage('/tocando').action, parseMessage('/now').action);
});

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
    { scope: 'all_private_chats', language_code: '', count: 13 },
    { scope: 'all_private_chats', language_code: 'pt', count: 13 },
  ]);
  assert.deepEqual(requests.map(x => x.method), [
    'setMyCommands', 'getMyCommands', 'setMyCommands', 'getMyCommands',
  ]);
  for (const request of requests) {
    assert.deepEqual(request.payload.scope, { type: 'all_private_chats' });
    assert.ok(!Object.hasOwn(request.payload, 'reply_markup'));
    assert.ok(!Object.hasOwn(request.payload, 'inline_keyboard'));
  }
  assert.deepEqual(requests[0].payload.commands, PRIVATE_COMMANDS);
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
