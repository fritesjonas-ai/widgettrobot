import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { richViews } from '../tgcloud/lib/presentation/rich.js';

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.m?js$/.test(entry.name)) execFileSync('node', ['--check', path], { stdio: 'pipe' });
  }
}
walk('tgcloud'); walk('scripts'); walk('tests');

function checkImports(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) checkImports(path);
    else if (entry.name.endsWith('.js')) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        if (!match[1].startsWith('.')) continue;
        const target = resolve(dirname(path), match[1]);
        if (!target.startsWith(resolve('tgcloud') + sep)) throw Error('Import fora do projeto: ' + path);
        if (!existsSync(target) && !target.endsWith('lastfm-key.js')) {
          throw Error('Import inexistente: ' + path + ' → ' + match[1]);
        }
      }
    }
  }
}
checkImports('tgcloud');
const rich = richViews.musicCard({
  mode: 'playing', user: 'pessoa123', title: 'Música',
  artist: 'Artista', album: 'Álbum', image: '',
  recent: [{ title: 'Música', artist: 'Artista', nowplaying: true }],
});
const size = Buffer.byteLength(rich, 'utf8');
if (size > 32768) throw Error('Card Rich excedeu 32768 bytes: ' + size);
console.log('OK: sintaxe, imports e card musical Rich (' + size + ' bytes).');
