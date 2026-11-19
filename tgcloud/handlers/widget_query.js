import { createBot } from '../lib/bootstrap.js';
export default query => createBot().onWidget(query);
