import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotService } from '../tgcloud/lib/application/bot-service.js';
import { createLastfmClient } from '../tgcloud/lib/infrastructure/lastfm-client.js';
import { createDeezerCoverClient } from '../tgcloud/lib/infrastructure/deezer-cover.js';
import { richViews } from '../tgcloud/lib/presentation/rich.js';

const IMAGE='https://e-cdns-images.dzcdn.net/images/cover/1234abcd/500x500-000000-80-0-0.jpg';
const COVER_LASTFM='https://lastfm.freetls.fastly.net/i/u/300x300/cher.jpg';

function arrange({withAlbum=true,deezerTrack=[],deezerAlbums=[],badArtistSearch=false}={}) {
  const requests=[],sent=[],acks=[];
  const http=async url=>{
    const u=new URL(url);
    requests.push(u);
    if(u.hostname==='ws.audioscrobbler.com'){
      const method=u.searchParams.get('method');
      const fixture={
        'user.getTopTracks':{toptracks:{track:[
          {name:'Believe',artist:{name:'Cher'},playcount:'55',image:[]},
        ]}},
        'track.getInfo':{track:{
          name:'Believe',artist:{name:'Cher'},
          ...(withAlbum?{album:{title:'Believe',image:[]}}:{}),
        }},
        'album.getInfo':{album:{image:[]}},
        'track.search':{results:{trackmatches:{track:[
          {name:'Believe',artist:'Cher',image:[]},
        ]}}},
        'artist.search':badArtistSearch?{unrelated:true}:
          {results:{artistmatches:{artist:[{name:'Cher'}]}}},
      };
      if(!Object.hasOwn(fixture,method))throw Error('Unexpected Last.fm method '+method);
      return {ok:true,status:200,json:async()=>fixture[method]};
    }
    if(u.hostname==='api.deezer.com' && u.pathname==='/search/track') {
      return {ok:true,json:async()=>({data:deezerTrack})};
    }
    if(u.hostname==='api.deezer.com' && u.pathname==='/search/album') {
      return {ok:true,json:async()=>({data:deezerAlbums})};
    }
    throw Error('Unexpected outbound domain '+u.hostname);
  };
  const lastfm=createLastfmClient({request:http,apiKey:'test-private-key'});
  const deezer=createDeezerCoverClient({request:http});
  const bot=createBotService({
    profiles:{async get(){return 'rj'}},
    lastfm,deezerCover:deezer,
    messenger:{async rich(chat,markup){sent.push(markup)},
      async callbackAnswer(id){acks.push(id)}},
    views:richViews,logger:{error(){}},
  });
  const command=async text=>bot.onMessage({
    text,chat:{id:101,type:'private'},from:{id:101},
  });
  return {command,bot,requests,sent,acks,lastfm,deezer};
}

test('ranking mensal sem álbum obtém capa Deezer do álbum confirmado por track.getInfo',async()=>{
  const h=arrange({deezerAlbums:[{title:'Believe',artist:{name:'Cher'},cover_big:IMAGE}]});
  await h.command('/tops faixas 1m');
  assert.equal(h.sent.length,1);
  assert.ok(h.sent[0].includes(IMAGE),'Capa do álbum da faixa líder não apareceu');
  assert.match(h.sent[0],/Top músicas · 1 mês/);
  assert.match(h.sent[0],/Cher — Believe/);
  assert.deepEqual(h.requests.map(x=>x.searchParams.get('method')||x.pathname),[
    'user.getTopTracks','track.getInfo','album.getInfo','/search/album',
  ]);
  assert.equal(h.requests[0].searchParams.get('period'),'1month');
});

test('sem álbum nem imagem no Last.fm encontra capa da faixa exata no Deezer',async()=>{
  const h=arrange({withAlbum:false,deezerTrack:[
    {title:'Holiday',artist:{name:'Madonna'},album:{title:'Holiday',cover_big:IMAGE}},
    {title:'Believe',artist:{name:'Cher'},album:{title:'Believe',cover_big:IMAGE}},
  ]});
  await h.command('/tops faixas 1m');
  assert.ok(h.sent[0].includes(IMAGE));
  assert.deepEqual(h.requests.map(x=>x.searchParams.get('method')||x.pathname),[
    'user.getTopTracks','track.getInfo','/search/track',
  ]);
});

test('artista errado ou imagem maliciosa não são aceitos como capa da faixa',async()=>{
  for(const result of [
    {title:'Believe',artist:{name:'Another'},album:{title:'Believe',cover_big:IMAGE}},
    {title:'Believe (Remix)',artist:{name:'Cher'},album:{title:'Believe',cover_big:IMAGE}},
    {title:'Believe',artist:{name:'Cher'},album:{title:'Believe',cover_big:'https://untrusted.example/x.jpg'}},
  ]) {
    const h=arrange({withAlbum:false,deezerTrack:[result]});
    await h.command('/tops faixas 1m');
    assert.equal(h.sent.length,1);
    assert.doesNotMatch(h.sent[0],/<img /);
    assert.match(h.sent[0],/Cher — Believe/);
  }
});

test('se o Deezer confirma faixa e álbum, pode procurar no Cover Art Archive sem exibir URL insegura',async()=>{
  const h=arrange({withAlbum:false,deezerTrack:[
    {title:'Believe',artist:{name:'Cher'},album:{title:'Believe',cover_big:'javascript:bad'}},
  ]});
  // Service fallback is passed as a real boundary, not a patched view.
  const sent=[];
  const bot=createBotService({
    profiles:{async get(){return 'rj'}},
    lastfm:h.lastfm,deezerCover:h.deezer,
    coverArt:{async find(artist,album){
      assert.deepEqual([artist,album],['Cher','Believe']);
      return COVER_LASTFM;
    }},
    messenger:{async rich(chat,html){sent.push(html)}},
    views:richViews,logger:{error(){}},
  });
  await bot.onMessage({text:'/tops faixas 1m',chat:{id:101,type:'private'},from:{id:101}});
  assert.ok(sent[0].includes(COVER_LASTFM));
  assert.doesNotMatch(sent[0],/javascript:bad/);
});

test('/buscar sem termo e botão Buscar exibem ajuda em vez de erro',async()=>{
  const h=arrange();
  await h.command('/buscar');
  assert.match(h.sent[0],/\/buscar artista termo/);
  assert.doesNotMatch(h.sent[0],/Formato inválido/);
  assert.equal(h.requests.length,0);
  await h.bot.onCallback({id:'cb-1',data:'wt:search',
    message:{chat:{id:101,type:'private'}},from:{id:101}});
  assert.deepEqual(h.acks,['cb-1']);
  assert.match(h.sent[1],/\/buscar faixa termo/);
  assert.equal(h.requests.length,0);
});

test('/buscar geral consulta faixas e artistas e mostra as duas seções sem teclado inline',async()=>{
  const h=arrange();
  await h.command('/buscar Cher');
  assert.deepEqual(h.requests.slice(0,2).map(x=>x.searchParams.get('method')),
    ['track.search','artist.search']);
  assert.ok(h.requests.some(x=>x.searchParams.get('method')==='track.getInfo'));
  const markup=h.sent[0];
  assert.match(markup,/<h3>Faixas<\/h3>/);
  assert.match(markup,/<h3>Artistas<\/h3>/);
  assert.match(markup,/https:\/\/www.last.fm\/music\/Cher/);
  assert.doesNotMatch(markup,/inline_keyboard|reply_markup/);
});

test('filtros busca apenas faixas ou apenas artistas',async()=>{
  const h=arrange();
  await h.command('/buscar artista Cher');
  assert.deepEqual(h.requests.map(x=>x.searchParams.get('method')),['artist.search']);
  assert.match(h.sent.at(-1),/<h3>Artistas<\/h3>/);
  assert.doesNotMatch(h.sent.at(-1),/<h3>Faixas<\/h3>|<img/);
  h.requests.length=0;
  await h.command('/buscar faixa Believe');
  assert.equal(h.requests[0].searchParams.get('method'),'track.search');
  assert.ok(h.requests.some(x=>x.pathname==='/search/track'));
  assert.ok(!h.requests.some(x=>x.searchParams.get('method')==='artist.search'));
  assert.match(h.sent.at(-1),/<h3>Faixas<\/h3>/);
  assert.doesNotMatch(h.sent.at(-1),/<h3>Artistas<\/h3>/);
});

test('artist.search malformado não é tratado como resultado vazio',async()=>{
  const h=arrange({badArtistSearch:true});
  await h.command('/buscar artista Cher');
  assert.match(h.sent[0],/Não foi possível/);
  assert.doesNotMatch(h.sent[0],/Nenhum artista encontrado/);
  assert.doesNotMatch(h.sent[0],/test-private-key/);
});

test('track.getInfo de música diferente não fornece álbum ou capa',async()=>{
  const client=createLastfmClient({apiKey:'test-key',request:async()=>({
    ok:true,status:200,json:async()=>({track:{
      name:'Holiday',artist:{name:'Madonna'},
      album:{title:'Madonna',image:[{size:'extralarge','#text':COVER_LASTFM}]},
    }}),
  })});
  assert.deepEqual(await client.trackDetails({title:'Believe',artist:'Cher'}),
    {album:'',image:''});
});

test('capa de Deezer por faixa usa cache e respeita edição informada',async()=>{
  const calls=[];
  const client=createDeezerCoverClient({request:async url=>{
    calls.push(url);
    return {ok:true,json:async()=>({data:[
      {title:'Believe',artist:{name:'Cher'},album:{title:'Believe (Remix)',cover_big:IMAGE}},
      {title:'Believe',artist:{name:'Cher'},album:{title:'Believe',cover_big:IMAGE}},
    ]})};
  }});
  const result=await client.findTrack('Cher','Believe','Believe');
  assert.deepEqual(result,{image:IMAGE,album:'Believe'});
  assert.deepEqual(await client.findTrack('Cher','Believe','Believe'),result);
  assert.equal(calls.length,1);
});
