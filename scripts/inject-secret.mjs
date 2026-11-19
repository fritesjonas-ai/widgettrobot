import { writeFileSync, mkdirSync } from 'node:fs';

const key = String(process.env.LASTFM_API_KEY ?? '').trim();
if (!/^[a-z0-9]{16,128}$/i.test(key)) {
  console.error('LASTFM_API_KEY ausente ou formato inválido. Configure o Secret no GitHub.');
  process.exit(1);
}
mkdirSync('tgcloud/lib', { recursive: true });
writeFileSync('tgcloud/lib/lastfm-key.generated.js',
  `// Gerado no deploy. Nunca comitar.\nexport const LASTFM_API_KEY = ${JSON.stringify(key)};\n`,
  { mode: 0o600 });
console.log('Configuração Last.fm gerada no backend (valor oculto).');
