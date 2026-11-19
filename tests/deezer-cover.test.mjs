import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeezerCoverClient } from '../tgcloud/lib/infrastructure/deezer-cover.js';
import { createBotService } from '../tgcloud/lib/application/bot-service.js';
import { richViews } from '../tgcloud/lib/presentation/rich.js';

const cover = 'https://e-cdns-images.dzcdn.net/images/cover/12345abcde/500x500-000000-80-0-0.jpg';
const album = (artist='Cher', title='Believe', url=cover) =>
  ({ artist: { name: artist }, title, cover_big: url });
function gateway(data=[album()]) {
  const requests=[];
  return {requests, request: async url => {
    requests.push(url);
    return {ok:true, json: async()=>({data})};
  }};
}
test('resolve imagem pública via Deezer somente para álbum e artista corretos', async () => {
  const g = gateway();
  const api = createDeezerCoverClient({request:g.request});
  assert.equal(await api.find('Chér', 'Believe'), cover);
  assert.equal(g.requests.length, 1);
  assert.equal(new URL(g.requests[0]).origin, 'https://api.deezer.com');
  assert.equal(new URL(g.requests[0]).searchParams.get('limit'), '10');
});
test('não mostra capas de artistas diferentes, edições diferentes nem URLs não confiáveis', async () => {
  for (const data of [[album('Chet')], [album('Cher','Believe (Remixes)')],
    [album('Cher','Believe','https://example.com/p.png')],
    [album('Cher','Believe','javascript:alert(1)')]]) {
    const g=gateway(data);
    assert.equal(await createDeezerCoverClient({request:g.request}).find('Cher','Believe'),'');
  }
});
test('cache evita nova busca para capas encontradas e ausentes', async () => {
  const positive = gateway();
  const found = createDeezerCoverClient({request:positive.request});
  assert.equal(await found.find('Cher','Believe'), cover);
  assert.equal(await found.find('Cher','Believe'), cover);
  assert.equal(positive.requests.length, 1);

  const negative = gateway([album('Outra artista')]);
  const missing = createDeezerCoverClient({request:negative.request});
  assert.equal(await missing.find('Cher','Believe'), '');
  assert.equal(await missing.find('Cher','Believe'), '');
  assert.equal(negative.requests.length, 1);
});
test('depois do Last.fm sem capa, Deezer complementa o Rich card com a imagem', async () => {
  const sent=[], lookup=[];
  const bot=createBotService({
    profiles:{async get(){return 'cher'}},
    lastfm:{async recent(){return [{artist:'Cher',title:'Believe',album:'Believe',
      nowplaying:true,image:''}]},async coverFor(){return ''}},
    deezerCover:{async find(artist,album){lookup.push([artist,album]);return cover}},
    coverArt:{async find(){throw Error('MusicBrainz não deve ser consultado após sucesso Deezer')}},
    views:richViews,messenger:{async rich(id,html){sent.push(html)}},
  });
  await bot.onMessage({chat:{id:42,type:'private'},from:{id:42},text:'/widget'});
  assert.deepEqual(lookup,[['Cher','Believe']]);
  assert.equal(sent.length,1);
  assert.match(sent[0],/e-cdns-images\.dzcdn\.net\/images\/cover/);
  assert.match(sent[0],/<figure><img src=/);
});
