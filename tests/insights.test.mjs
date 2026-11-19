import test from 'node:test';
import assert from 'node:assert/strict';
import { createLastfmClient } from '../tgcloud/lib/infrastructure/lastfm-client.js';
import { createBotService } from '../tgcloud/lib/application/bot-service.js';
import { createTelegramMessenger } from '../tgcloud/lib/infrastructure/telegram-messenger.js';
import { richViews } from '../tgcloud/lib/presentation/rich.js';
import { parseMessage, fromCallback, TOP_PERIODS } from '../tgcloud/lib/domain/actions.js';
import { ExternalServiceError } from '../tgcloud/lib/domain/errors.js';

const cover='https://lastfm.freetls.fastly.net/i/u/300x300/sample.jpg';
const fixture={
 'user.getTopTracks':{toptracks:{track:[
   {name:'Song & One',artist:{name:'Artist <One>'},playcount:'124',image:[{size:'extralarge','#text':cover}]},
   {name:'Second',artist:{name:'Artist Two'},playcount:'28'},
 ]}},
 'user.getTopAlbums':{topalbums:{album:[
   {name:'Album One',artist:{name:'Artist One'},playcount:'59',image:[{size:'large','#text':cover}]}
 ]}},
 'user.getTopArtists':{topartists:{artist:[
   {name:'Artist One',playcount:'99'}, {name:'Artist Two',playcount:'18'}
 ]}},
 'user.getInfo':{user:{name:'rj',playcount:'12345',
   artist_count:'800',album_count:'900',track_count:'1000',
   registered:{unixtime:'1609459200'}}},
 'user.getLovedTracks':{lovedtracks:{track:[
   {name:'Love Song',artist:{name:'Love Artist'},image:[{size:'large','#text':cover}]},
   {name:'Lover',artist:{name:'Artist B'}},
 ]}},
 'user.getRecentTracks':{recenttracks:{track:[
   {name:'Recent Song',artist:{'#text':'Source Artist'},
     album:{'#text':'Seed Album'},image:[{size:'large','#text':cover}],
     '@attr':{nowplaying:'true'}},
 ]}},
 'track.getSimilar':{similartracks:{track:[
   {name:'Suggested',artist:{name:'New Artist'},image:[{size:'large','#text':cover}]},
   {name:'Another',artist:{name:'Other Artist'}}
 ]}},
 'artist.getSimilar':{similarartists:{artist:[{name:'Another Band'}]}},
 'track.getInfo':{track:{album:{image:[]}}},
 'album.getInfo':{album:{image:[]}},
};
function setup(overrides={}) {
 const requests=[],calls=[],activity=[],logs=[];
 const responses={...fixture,...overrides};
 const api={
  async sendRichMessage(data) {activity.push('rich');calls.push({method:'sendRichMessage',data});return {message_id:30};},
  async answerCallbackQuery(data) {activity.push('ack');calls.push({method:'answerCallbackQuery',data});return true;},
  async sendWidget() {throw Error('Unexpected sendWidget');},
 };
 const lastfm=createLastfmClient({
  apiKey:'integration-test-key',
  request:async raw=>{
   const params=new URL(raw).searchParams;
   const method=params.get('method');
   activity.push(method);
   requests.push({method,params});
   const value=responses[method];
   if(!value) throw Error('Unexpected Last.fm method '+method);
   return {ok:true,status:200,json:async()=>value};
  },
 });
 const bot=createBotService({
  lastfm,
  profiles:{async get(){return 'rj';}},
  messenger:createTelegramMessenger({api,logger:{error(...args){logs.push(args);}}}),
  views:richViews,logger:{error(...args){logs.push(args);}},
 });
 const message=text=>({chat:{id:123,type:'private'},from:{id:123},text});
 return {bot,requests,calls,activity,logs,responses,message,
  markup(){return calls.findLast(call=>call.method==='sendRichMessage')?.data.rich_message.html||''},
  reset(){calls.length=0;requests.length=0;activity.length=0;logs.length=0;}};
}
test('parser de /tops aceita categoria/período e rejeita filtros desconhecidos',()=>{
 assert.deepEqual(parseMessage('/tops'),{kind:'action',action:'tops',category:'tracks',period:'7day'});
 assert.deepEqual(parseMessage('/tops artistas 1m'),{kind:'action',action:'tops',category:'artists',period:'1month'});
 assert.deepEqual(parseMessage('/tops albuns geral'),{kind:'action',action:'tops',category:'albums',period:'overall'});
 assert.deepEqual(parseMessage('/tops 12m'),{kind:'action',action:'tops',category:'tracks',period:'12month'});
 assert.equal(parseMessage('/tops inventado').kind,'invalid');
 assert.equal(parseMessage('/tops artistas inventado').kind,'invalid');
 assert.equal(parseMessage('/tops 1m 7d').kind,'invalid');
 assert.deepEqual(fromCallback('wt:tops:albums:3month'),
   {action:'tops',category:'albums',period:'3month'});
 assert.equal(fromCallback('wt:tops:script:7day'),null);
 assert.equal(fromCallback('wt:tops:tracks:invalid'),null);
 assert.equal(fromCallback('wt:tops:tracks:7day:extra'),null);
 assert.equal(Object.keys(TOP_PERIODS).length,6);
});
test('/ajuda inclui navegação Rich para as cinco funções sem alterar o card musical',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/ajuda'));
 assert.equal(h.calls.length,1);
 for(const action of ['tops','stats','loved','weekly','discover']) {
  assert.match(h.markup(),new RegExp('data="wt:'+action+'"'));
 }
 assert.match(h.markup(),/\/tops faixas 7d/);
 assert.doesNotMatch(h.markup(),/inline_keyboard|reply_markup/);
});

test('/tops exibe ranking, capa, tags Rich e navegação de períodos',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/tops faixas 1m'));
 assert.equal(h.calls.length,1);
 assert.equal(h.requests[0].method,'user.getTopTracks');
 assert.equal(h.requests[0].params.get('period'),'1month');
 assert.equal(h.requests[0].params.get('limit'),'5');
 assert.match(h.markup(),/Top músicas · 1 mês/);
 assert.match(h.markup(),/<figure><img src="/);
 assert.match(h.markup(),/Song &amp; One/);
 assert.match(h.markup(),/Artist &lt;One&gt;/);
 assert.match(h.markup(),/124/);
 assert.match(h.markup(),/wt:tops:albums:1month/);
 assert.match(h.markup(),/wt:tops:tracks:overall/);
 assert.doesNotMatch(h.markup(),/inline_keyboard|reply_markup|<script/i);
});
test('/tops artistas nunca inventa a capa de uma música alheia',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/tops artistas'));
 assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].method,'user.getTopArtists');
 assert.match(h.markup(),/Top artistas/);
 assert.match(h.markup(),/Artist One/);
 assert.doesNotMatch(h.markup(),/<img/);
});
test('/tops albuns aproveita imagem oficial do primeiro álbum',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/tops albuns 3m'));
 assert.equal(h.requests[0].method,'user.getTopAlbums');
 assert.match(h.markup(),/Top álbuns · 3 meses/);
 assert.match(h.markup(),/<img src="/);
});
test('/stats traz scrobbles e dados públicos sem dados inventados, com última capa',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/stats'));
 assert.deepEqual(h.requests.map(x=>x.method),['user.getInfo','user.getRecentTracks']);
 assert.match(h.markup(),/12\.345/);
 assert.match(h.markup(),/800 artistas/);
 assert.match(h.markup(),/900 álbuns/);
 assert.match(h.markup(),/1\.000 músicas/);
 assert.match(h.markup(),/Desde 2021/);
 assert.match(h.markup(),/<img src="/);
});
test('/stats omite campos ausentes em vez de imprimir zero fictício',async()=>{
 const h=setup({'user.getInfo':{user:{name:'rj',playcount:'9'}}});
 await h.bot.onMessage(h.message('/stats'));
 assert.match(h.markup(),/>9<\/b> scrobbles/);
 assert.doesNotMatch(h.markup(),/ artistas| álbuns| músicas|Desde/);
});
test('/amadas lista músicas e recupera imagem da primeira faixa',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/amadas'));
 assert.equal(h.requests[0].method,'user.getLovedTracks');
 assert.match(h.markup(),/Músicas amadas/);
 assert.match(h.markup(),/Love Artist — <b>Love Song<\/b>/);
 assert.match(h.markup(),/<img src="/);
});
test('/amadas com lista vazia mostra estado explícito sem imagem',async()=>{
 const h=setup({'user.getLovedTracks':{lovedtracks:{track:[]}}});
 await h.bot.onMessage(h.message('/amadas'));
 assert.match(h.markup(),/Nenhuma música amada/);
 assert.doesNotMatch(h.markup(),/<img/);
});
test('/semana usa rankings dos últimos sete dias para as três categorias',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/semana'));
 assert.deepEqual(h.requests.map(x=>x.method),
  ['user.getTopTracks','user.getTopArtists','user.getTopAlbums']);
 assert.ok(h.requests.every(x=>x.params.get('period')==='7day'));
 assert.match(h.markup(),/Seus últimos 7 dias/);
 assert.match(h.markup(),/<h4>Músicas<\/h4>/);
 assert.match(h.markup(),/<h4>Artistas<\/h4>/);
 assert.match(h.markup(),/<h4>Álbuns<\/h4>/);
 assert.match(h.markup(),/<img src="/);
});
test('/descobrir recomenda faixas com base na última música ouvida',async()=>{
 const h=setup();
 await h.bot.onMessage(h.message('/descobrir'));
 assert.deepEqual(h.requests.map(x=>x.method),['user.getRecentTracks','track.getSimilar']);
 assert.equal(h.requests[1].params.get('artist'),'Source Artist');
 assert.equal(h.requests[1].params.get('track'),'Recent Song');
 assert.match(h.markup(),/Source Artist — Recent Song/);
 assert.match(h.markup(),/New Artist — Suggested/);
 assert.match(h.markup(),/<img src="/);
});
test('/descobrir usa artistas similares se não houver músicas semelhantes',async()=>{
 const h=setup({'track.getSimilar':{similartracks:{track:[]}}});
 await h.bot.onMessage(h.message('/descobrir'));
 assert.deepEqual(h.requests.map(x=>x.method),[
  'user.getRecentTracks','track.getSimilar','artist.getSimilar']);
 assert.match(h.markup(),/Descobrir artistas/);
 assert.match(h.markup(),/Another Band/);
 assert.doesNotMatch(h.markup(),/<img/);
});
test('callbacks Rich refinam /tops somente no chat privado autorizado e com ACK prévio',async()=>{
 const h=setup();
 await h.bot.onCallback({id:'cb1',data:'wt:tops:artists:overall',
   message:{chat:{id:123,type:'private'}},from:{id:123}});
 assert.equal(h.calls[0].method,'answerCallbackQuery');
 assert.equal(h.requests[0].params.get('period'),'overall');
 assert.equal(h.requests[0].method,'user.getTopArtists');
 assert.match(h.markup(),/Top artistas · geral/);
 h.reset();
 await h.bot.onCallback({id:'cb2',data:'wt:tops:tracks:7day',
   message:{chat:{id:123,type:'private'}},from:{id:456}});
 assert.deepEqual(h.calls.map(x=>x.method),['answerCallbackQuery']);
 assert.equal(h.requests.length,0);
});
test('Last.fm erro 29 em recurso novo produz Rich informativo sem expor chave',async()=>{
 const h=setup({'user.getTopTracks':{error:29,message:'Rate limit exceeded'}});
 await h.bot.onMessage(h.message('/tops'));
 assert.match(h.markup(),/Last.fm limitou as consultas/);
 assert.doesNotMatch(h.markup(),/integration-test-key/);
 assert.ok(h.logs.some(x=>x[1]?.code===29));
});
test('resposta inesperada não vira ranking vazio silenciosamente',async()=>{
 const h=setup({'user.getTopTracks':{unexpected:{}}});
 await h.bot.onMessage(h.message('/tops'));
 assert.match(h.markup(),/Não foi possível concluir a operação/);
 assert.doesNotMatch(h.markup(),/Nenhum registro neste período/);
});
test('payloads de respostas vazias e respostas de um único item são aceitos',async()=>{
 const h=setup({
  'user.getTopTracks':{toptracks:{track:{name:'Solo',artist:{name:'Unit'},playcount:'1'}}},
  'user.getLovedTracks':{lovedtracks:{track:[]}},
 });
 await h.bot.onMessage(h.message('/tops'));
 assert.match(h.markup(),/Unit — Solo/);
 assert.match(h.markup(),/>1<\/b>/);
 h.reset();
 await h.bot.onMessage(h.message('/amadas'));
 assert.match(h.markup(),/Nenhuma música amada/);
});
