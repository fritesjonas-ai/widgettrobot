import { api } from 'sdk';
import { configurePrivateCommands } from '../lib/domain/private-commands.js';

// This is an explicit CI operation, not a message handler.
// Configures ONLY the BotCommandScopeAllPrivateChats scope.
export default async function () {
  return configurePrivateCommands(api);
}
