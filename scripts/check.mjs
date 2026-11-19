import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Script } from 'node:vm';
import { LASTFM_WIDGET_HTML } from '../tgcloud/lib/presentation/widget.js';

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.m?js$/.test(entry.name)) execFileSync('node', ['--check', path], { stdio: 'pipe' });
  }
}
walk('tgcloud'); walk('scripts'); walk('tests');

const raw = Buffer.byteLength(LASTFM_WIDGET_HTML, 'utf8');
const compressed = deflateSync(Buffer.from(LASTFM_WIDGET_HTML), { level: 9 }).length;
if (raw > 32768 || compressed > 4096) throw Error(`Widget excedeu limite: ${raw} / ${compressed}`);
if (/LASTFM_API_KEY|fetch\(|XMLHttpRequest|<script[^>]+src=/i.test(LASTFM_WIDGET_HTML)) {
  throw Error('Widget contém segredo, acesso direto à rede ou script externo.');
}
const inline = LASTFM_WIDGET_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!inline) throw Error('Widget sem JavaScript inline.');
new Script(inline, { filename: 'widget.inline.js' });

// Verify each local import resolves to an on-disk file, except the CI-generated key.
function checkImports(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) checkImports(path);
    else if (entry.name.endsWith('.js')) {
      const source = readFileSync(path, 'utf8');
      const imports = source.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const match of imports) {
        const imp = match[1];
        if (!imp.startsWith('.')) continue;
        const target = resolve(dirname(path), imp);
        if (!(target.startsWith(resolve('tgcloud') + sep))) throw Error(`Import fora do projeto: ${path} → ${imp}`);
        if (!existsSync(target) && !target.endsWith('lastfm-key.generated.js')) {
          throw Error(`Import inexistente: ${path} → ${imp}`);
        }
      }
    }
  }
}
checkImports('tgcloud');
console.log(`OK: sintaxe, integridade de imports, segurança básica e Widget ${raw} B / ${compressed} B zlib.`);
