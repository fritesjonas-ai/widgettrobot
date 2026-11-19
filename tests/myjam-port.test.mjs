import test from 'node:test';
import assert from 'node:assert/strict';
import {createBotService} from '../tgcloud/lib/application/bot-service.js';
import {createLastfmClient} from '../tgcloud/lib/infrastructure/lastfm-client.js';
import {createLyricsClient} from '../tgcloud/lib/infrastructure/lyrics-client.js';
import {richViews} from '../tgcloud/lib/presentation/rich.js';
import {parseMessage,fromCallback} from '../tgcloud/lib/domain/actions.js';
const COVER='https://lastfm.freetls.fastly.net/i/u/300x300/sample.jpg';
const song={title:'Believe',artist:'Cher',album:'Believe',image:COVER,nowplaying:true};
function mock(props={}) {
 const calls=[],history=[];
 const lastfm={
  async recent(){history.push('recent');return [song];},
  async albumInfo(a,b){history.push('albumInfo');return {title:b,artist:a,tracks:['Believe','Strong Enough'],image:COVER};},
  async search(q){history.push('search:'+q);return [{...song}];},
  async top(u,k,p,l){
   history.push('top:'+k+':'+p+':'+l);
   return k==='artists'?[{artist:'Cher',title:'Cher',playcount:45,image:''}]:
    [{artist:'Cher',title:'Believe',album:'Believe',playcount:42,image:COVER}];
  },
  async coverFor(){history.push('coverFor');return COVER;},
 };
 const bot=createBotService({
  profiles:{async get(){return 'rj';}},
  lastfm:{...lastfm,...props.lastfm},
  lyrics:{async preview(){history.push('lyrics');return {status:'preview',excerpt:'Love is only what we hold inside the song'};}},
  messenger:{async rich(id,html){calls.push({id,html})},async callbackAnswer(id){history.push('ack:'+id)}},
  views:richViews,logger:{error(){}},
 });
 const msg=text=>({chat:{id:101,type:'private'},from:{id:101},text});
 return {bot,calls,history,msg};
}
test('aliases do myJAM funcionam somente como rotas novas no widgettrobot',()=>{
 assert.deepEqual(parseMessage('/albnow'),{kind:'action',action:'album'});
 assert.deepEqual(parseMessage('/tly'),{kind:'action',action:'lyrics'});
 assert.deepEqual(parseMessage('/radiofm Cher Believe'),{kind:'action',action:'search',term:'Cher Believe'});
 assert.deepEqual(parseMessage('/myself'),{kind:'action',action:'summary'});
 assert.equal(parseMessage('/buscar').kind,'invalid');
 assert.equal(fromCallback('wt:album'),'album');
 assert.equal(fromCallback('wt:lyrics'),'lyrics');
 assert.equal(fromCallback('wt:search'),'search');
 assert.equal(fromCallback('wt:summary'),'summary');
});
test('/album mostra capa correta, faixas e botões Rich',async()=>{
 const h=mock();await h.bot.onMessage(h.msg('/album'));
 assert.deepEqual(h.history,['recent','albumInfo']);
 const rich=h.calls[0].html;
 assert.match(rich,/<figure><img src=/);
 assert.match(rich,/<h2>Believe<\/h2>/);
 assert.match(rich,/<li>Strong Enough<\/li>/);
 assert.match(rich,/data="wt:lyrics"/);
 assert.doesNotMatch(rich,/inline_keyboard|reply_markup/);
});
test('/letra mostra trecho curto do LRCLIB com capa da faixa',async()=>{
 const h=mock();await h.bot.onMessage(h.msg('/letra'));
 assert.deepEqual(h.history,['recent','lyrics']);
 assert.match(h.calls[0].html,/Love is only what we hold inside the song/);
 assert.match(h.calls[0].html,/Trecho de até dez palavras/);
 assert.match(h.calls[0].html,/<figure><img/);
});
test('/buscar mostra capa do primeiro resultado e HTML escapado',async()=>{
 const h=mock();await h.bot.onMessage(h.msg('/buscar Believe & Cher'));
 assert.deepEqual(h.history,['search:Believe & Cher']);
 assert.match(h.calls[0].html,/Buscar: Believe &amp; Cher/);
 assert.match(h.calls[0].html,/https:\/\/www.last.fm\/music\/Cher\/_\/Believe/);
 assert.match(h.calls[0].html,/<figure><img/);
});
test('/resumo mostra botões semana, mês e histórico',async()=>{
 const h=mock();await h.bot.onMessage(h.msg('/resumo'));
 assert.equal(h.history.length,0);
 assert.match(h.calls[0].html,/wt:tops:tracks:7day/);
 assert.match(h.calls[0].html,/wt:tops:tracks:1month/);
 assert.match(h.calls[0].html,/wt:tops:tracks:overall/);
});
test('capa /tops artistas vem de uma faixa pessoal do artista líder no mesmo período',async()=>{
 const h=mock();await h.bot.onMessage(h.msg('/tops artistas 1m'));
 assert.deepEqual(h.history,['top:artists:1month:5','top:tracks:1month:50']);
 assert.ok(h.calls[0].html.includes(COVER));
});
test('capa /tops artistas não usa faixa de outro artista',async()=>{
 const h=mock({lastfm:{async top(u,k,p,l){
   h.history.push('top:'+k+':'+p+':'+l);
   return k==='artists'?[{artist:'Cher',title:'Cher'}]:
     [{artist:'Madonna',title:'Holiday',album:'Holiday',image:COVER}];
 }}});
 await h.bot.onMessage(h.msg('/tops artistas 1m'));
 assert.doesNotMatch(h.calls[0].html,/<img/);
});
test('callback Rich do álbum recebe ACK antes da consulta',async()=>{
 const h=mock();
 await h.bot.onCallback({id:'ack-1',data:'wt:album',
   message:{chat:{id:101,type:'private'}},from:{id:101}});
 assert.deepEqual(h.history,['ack:ack-1','recent','albumInfo']);
 assert.match(h.calls[0].html,/Strong Enough/);
});
test('LRCLIB exige correspondência exata e não devolve mais de dez palavras',async()=>{
 const payload=[{artistName:'CHÉR',trackName:'Believe',instrumental:false,
  plainLyrics:'one two three four five six seven eight nine ten eleven twelve'}];
 const urls=[];
 const api=createLyricsClient({request:async url=>{
  urls.push(url);return {ok:true,json:async()=>payload};
 }});
 assert.deepEqual(await api.preview('Cher','Believe'),
  {status:'preview',excerpt:'one two three four five six seven eight nine ten'});
 assert.equal(new URL(urls[0]).hostname,'lrclib.net');
 const bad=createLyricsClient({request:async()=>({ok:true,json:async()=>
  [{artistName:'Someone else',trackName:'Believe',plainLyrics:'bad'}]})});
 assert.equal((await bad.preview('Cher','Believe')).status,'missing');
});
test('Last.fm album.getInfo e track.search usam API oficial existente',async()=>{
 const requests=[];
 const client=createLastfmClient({apiKey:'stub-key',request:async url=>{
  const p=new URL(url).searchParams;requests.push(p);
  return {ok:true,status:200,json:async()=>p.get('method')==='album.getInfo'?
   {album:{name:'Believe',artist:'Cher',image:[{size:'extralarge','#text':COVER}],
     tracks:{track:[{name:'Believe'}]}}}:
   {results:{trackmatches:{track:[{name:'Believe',artist:'Cher'}]}}}};
 }});
 const album=await client.albumInfo('Cher','Believe');
 const matches=await client.search('Believe',5);
 assert.equal(album.title,'Believe');assert.deepEqual(album.tracks,['Believe']);
 assert.equal(matches[0].title,'Believe');
 assert.deepEqual(requests.map(p=>p.get('method')),['album.getInfo','track.search']);
 assert.ok(requests.every(p=>p.get('api_key')==='stub-key'));
});
