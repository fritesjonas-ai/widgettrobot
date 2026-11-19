import { createBot } from '../lib/bootstrap.js';
export default message => createBot().onMessage(message);
