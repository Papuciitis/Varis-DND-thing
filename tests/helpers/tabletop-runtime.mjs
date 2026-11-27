import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../tabletop/package.json',import.meta.url));
export function socketServer() {
  try {return require('ws').WebSocketServer;}
  catch {
    return require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/lib/utilsBundle.js')).wsServer;
  }
}
