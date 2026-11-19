import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoverArtArchiveClient } from '../tgcloud/lib/infrastructure/cover-art-archive.js';
import { createBotService } from '../tgcloud/lib/application/bot-service.js';
import { richViews } from '../tgcloud/lib/presentation/rich.js';

const id = '89abcdef-0123-4567-89ab-0123456789ab';
const expected = 'https://coverartarchive.org/release-group/' + id + '/front-500';
const group = (artist = 'Cher', album = 'Believe', override = {}) => ({
  id, title: album, 'artist-credit': [{ name: artist }], 'primary-type': 'Album', ...override,
});
function fixture(groups = [group()], images = [{ front: true, approved: true }]) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({url, init});
    return {ok:true, json: async () => url.includes('musicbrainz.org')
      ? {'release-groups':groups} : {images}};
  };
  return {request, calls};
}
test('busca MusicBrainz e obtém URL oficial de capa frontal confirmada pelo CAA', async () => {
  const g = fixture();
  const api = createCoverArtArchiveClient({request:g.request});
  assert.equal(await api.find('Cher','Believe'), expected);
  assert.equal(g.calls.length, 2);
  const q = new URL(g.calls[0].url);
  assert.match(q.searchParams.get('query'), /releasegroup:"Believe" AND artist:"Cher"/);
  assert.match(g.calls[0].init.headers['User-Agent'], /widgettrobot/);
  assert.equal(g.calls[1].url, 'https://coverartarchive.org/release-group/' + id);
});
test('rejeita capas quando artista, álbum ou MBID não coincidem', async () => {
  for(const g of [[group('Chet')],[group('Cher','Believe Again')],[group('Cher','Believe',{id:'javascript:x'})]]) {
    const f = fixture(g);
    assert.equal(await createCoverArtArchiveClient({request:f.request}).find('Cher','Believe'), '');
    assert.equal(f.calls.length,1);
  }
});
test('não usa imagem de verso ou imagem reprovada', async () => {
  for (const images of [[{front:false,approved:true}], [{front:true,approved:false}], []]) {
    const f=fixture([group()],images);
    assert.equal(await createCoverArtArchiveClient({request:f.request}).find('Cher','Believe'),'');
    assert.equal(f.calls.length,2);
  }
});
test('cache e intervalo mínimo evitam excesso de buscas à API', async () => {
  let time=10000;const f=fixture();
  const api=createCoverArtArchiveClient({request:f.request,clock:()=>time});
  assert.equal(await api.find('Cher','Believe'),expected);
  assert.equal(await api.find('Cher','Believe'),expected);
  assert.equal(await api.find('Muse','Absolution'),'');
  assert.equal(f.calls.length,2);
  time+=1100;
  await api.find('Muse','Absolution');
  assert.equal(f.calls.length,3);
});
test('fallback sem resposta não quebra o card Rich', async () => {
  const sent=[],errors=[];
  const bot=createBotService({
    profiles:{async get(){return 'cher'}},
    lastfm:{
      async recent(){return [{title:'Believe',artist:'Cher',album:'Believe',image:'',nowplaying:true}]},
      async coverFor(){return ''}
    },
    coverArt:{async find(){throw Error('CAA indisponível')}},
    messenger:{async rich(id,markup){sent.push(markup)}},
    views:richViews,logger:{error(...data){errors.push(data)}},
  });
  await bot.onMessage({chat:{id:123,type:'private'},from:{id:123},text:'/widget'});
  assert.equal(sent.length,1);
  assert.match(sent[0],/Believe/);
  assert.match(sent[0],/Capa não disponível/);
  assert.ok(errors.some(x=>x[1].operation==='cover-art-archive'));
});
