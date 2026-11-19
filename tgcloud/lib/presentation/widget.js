import { WIDGET_ACTION } from '../domain/actions.js';
export const LASTFM_WIDGET_HTML = String.raw`<!doctype html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}
body{margin:0;padding:13px;color:var(--tg-theme-text-color);background:var(--tg-theme-bg-color);font:14px system-ui,sans-serif}
.top{display:flex;align-items:center;gap:8px;height:23px}
.dot{height:9px;width:9px;border-radius:50%;background:#d51007}
.brand{font-size:12px;font-weight:800;letter-spacing:.05em}
.user{margin-left:auto;color:var(--tg-theme-hint-color);font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tabs{display:flex;background:var(--tg-theme-secondary-bg-color);padding:3px;border-radius:11px;gap:3px;margin:12px 0 9px}
.tab{flex:1;padding:7px 2px;border:0;border-radius:8px;background:transparent;color:var(--tg-theme-hint-color);font:700 12px system-ui,sans-serif}
.tab.sel{background:var(--tg-theme-bg-color);color:var(--tg-theme-text-color)}
.page{height:240px;overflow:hidden}
.now{display:flex;gap:12px;align-items:center;margin:21px 0}
.cover{width:86px;height:86px;flex:0 0 86px;border-radius:17px;background:linear-gradient(145deg,#d51007,#652d77);display:grid;place-items:center}
.disc{width:61px;height:61px;border-radius:50%;background:repeating-radial-gradient(circle,#211928 0,#211928 5px,#51364b 6px,#211928 8px);border:2px solid #ffa4aa;display:grid;place-items:center}
.disc:after{content:'';width:13px;height:13px;border-radius:50%;background:#eee0d9}
.details{flex:1;min-width:0}
.status{font-size:11px;font-weight:800;color:var(--tg-theme-link-color);margin-bottom:7px}
.title{font-size:17px;line-height:1.19;font-weight:800;overflow-wrap:anywhere;max-height:63px;overflow:hidden}
.artist{margin-top:7px;font-size:13px;overflow-wrap:anywhere;max-height:40px;overflow:hidden}
.album{font-size:12px;margin-top:5px;color:var(--tg-theme-hint-color);overflow-wrap:anywhere;max-height:31px;overflow:hidden}
.help{font-size:12px;color:var(--tg-theme-hint-color);line-height:1.45;margin-top:14px}
.hname{font-size:16px;font-weight:800;margin:14px 0 11px}
.songs{display:flex;flex-direction:column;gap:3px}
.song{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--tg-theme-secondary-bg-color);align-items:center;min-height:39px}
.idx{color:var(--tg-theme-hint-color);font-size:12px;min-width:15px}
.songtxt{min-width:0;flex:1}
.songtitle{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.songartist{font-size:11px;color:var(--tg-theme-hint-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.live{font-size:10px;color:var(--tg-theme-link-color)}
.actions{display:flex;gap:7px;margin-top:3px}
.action{border:0;flex:1;min-width:0;border-radius:10px;background:var(--tg-theme-secondary-bg-color);color:var(--tg-theme-text-color);padding:10px 3px;font:700 12px system-ui,sans-serif}
.action.primary{background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color)}
.action:disabled{opacity:.55}
.note{margin-top:8px;font-size:11px;line-height:1.2;color:var(--tg-theme-hint-color);min-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
<div class="top"><span class="dot"></span><span class="brand">LAST.FM / WIDGETTROBOT</span><span class="user" id="user"></span></div>
<div class="tabs"><button class="tab sel" id="t-now">Tocando</button><button class="tab" id="t-recent">Recentes</button><button class="tab" id="t-profile">Perfil</button></div>
<div class="page" id="p-now"><div class="now"><div class="cover"><div class="disc"></div></div><div class="details"><div class="status" id="status">CONSULTANDO...</div><div class="title" id="title">Carregando música</div><div class="artist" id="artist"></div><div class="album" id="album"></div></div></div><div class="help">A música exibida vem do scrobbling do Last.fm. O card atualiza enquanto estiver visível no chat privado.</div></div>
<div class="page" id="p-recent" style="display:none"><div class="hname">Últimas reproduções</div><div class="songs" id="songs"></div></div>
<div class="page" id="p-profile" style="display:none"><div class="hname">Perfil conectado</div><div id="profile-user"></div><div class="help">Para trocar a conta, envie /setuser usuario no chat. Para desvincular, envie /remover confirmar. Toque em "Enviar Rich" para receber as instruções como uma mensagem.</div></div>
<div class="actions"><button class="action primary" id="refresh">Atualizar</button><button class="action" id="send">Enviar Rich</button><button class="action" id="open">Abrir Last.fm</button></div>
<div class="note" id="note">Atualização automática a cada 30 segundos.</div>
<script>
(function(){
 const W=window.TelegramWidget, $=id=>document.getElementById(id);
 let state={}, active='now', pending=false, updateVersion=0;
 function parse(raw){try{return JSON.parse(raw||'{}')}catch(e){return {v:0,_error:'Dados inválidos recebidos do Telegram.'}}}
 function tab(name){active=name;['now','recent','profile'].forEach(n=>{
   $('p-'+n).style.display=n===name?'block':'none';
   $('t-'+n).className='tab'+(n===name?' sel':'');
 });}
 function render(obj){if(!obj||obj.v!==1){
   $('status').textContent='ERRO NO WIDGET';
   $('title').textContent='Não foi possível interpretar o estado.';
   $('note').textContent=obj&&obj._error||'Estado inválido no Widget.';return;
 }state=obj;
   $('user').textContent=state.u?'@'+state.u:'';
   $('status').textContent=state.m==='playing'?'● TOCANDO AGORA':state.m==='last'?'ÚLTIMA REPRODUÇÃO':state.m==='error'?'ERRO':'SEM REPRODUÇÕES';
   $('title').textContent=state.m==='error'?state.e||'Falha ao consultar':state.t||'Nenhuma música encontrada';
   $('artist').textContent=state.a||'';$('album').textContent=state.b||'';
   $('profile-user').textContent=state.u?'Last.fm: @'+state.u:'Nenhum perfil vinculado';
   const wrap=$('songs');while(wrap.firstChild)wrap.removeChild(wrap.firstChild);
   const tracks=state.list||[];
   if(!tracks.length){const x=document.createElement('div');x.className='help';x.textContent='Nenhuma música recente encontrada.';wrap.appendChild(x)}
   tracks.forEach((track,i)=>{
     const row=document.createElement('div');row.className='song';
     const index=document.createElement('span');index.className='idx';index.textContent=String(i+1);
     const info=document.createElement('div');info.className='songtxt';
     const title=document.createElement('div');title.className='songtitle';title.textContent=track[1]||'-';
     const artist=document.createElement('div');artist.className='songartist';artist.textContent=track[0]||'-';
     info.appendChild(title);info.appendChild(artist);row.appendChild(index);row.appendChild(info);
     if(track[2]){const live=document.createElement('span');live.className='live';live.textContent='LIVE';row.appendChild(live)}
     wrap.appendChild(row);
   });
 }
 let waitingForUpdate=false, updateTimer=null, autoPaused=false;
 const knownErrors={
   NOT_ALLOWED:'Esta mensagem não permite consultas ao bot.',
   BUSY:'Já existe uma consulta em andamento.',
   RATE_LIMITED:'Limite de consultas do Telegram. Aguarde alguns segundos.',
   TIMEOUT:'O Telegram não recebeu resposta do bot a tempo.',
   FAILED:'Falha ao comunicar com o Telegram. Tente novamente.',
   INVALID_ANSWER:'Resposta inválida recebida do Telegram.'
 };
 function showUpdateStatus(){
   waitingForUpdate=false;
   if(updateTimer!==null){clearTimeout(updateTimer);updateTimer=null;}
   if(state.k==='rate_limited'||state.k==='invalid_key'||state.k==='suspended_key')autoPaused=true;
   else if(state.m!=='error')autoPaused=false;
   $('note').textContent=state.m==='error'?(state.e||'Consulta falhou.')+(autoPaused?' Atualização automática pausada.':''):'Dados atualizados pelo bot.';
 }
 function request(action){if(!W||!W.request){$('note').textContent='Consultas não disponíveis neste Telegram.';return;}
   if(pending)return;
   const startedAtVersion=updateVersion;
   pending=true;$('refresh').disabled=true;$('send').disabled=true;
   $('note').textContent='Enviando consulta ao bot...';
   W.request(action).then(answer=>{
     const result=parse(answer&&answer.result);
     if(result.ok===false){$('note').textContent=result.notice||'Consulta recusada pelo bot.';return;}
     if(result.ok!==true||result.status!=='accepted'){$('note').textContent='Resposta inesperada do bot.';return;}
     if(action==='${WIDGET_ACTION.REFRESH}'){
       if(updateVersion>startedAtVersion){showUpdateStatus();return;}
       waitingForUpdate=true;
       $('note').textContent='Solicitação recebida. Aguardando atualização do Widget...';
       if(updateTimer!==null)clearTimeout(updateTimer);
       updateTimer=setTimeout(()=>{
         if(waitingForUpdate){waitingForUpdate=false;autoPaused=true;$('note').textContent='Não foi possível confirmar a atualização. Atualização automática pausada; toque em Atualizar.';}
       },12000);
     }else{$('note').textContent='Solicitação aceita. A entrega da mensagem no chat ainda não foi confirmada.';}
   },error=>{if(error&&['RATE_LIMITED','TIMEOUT','FAILED'].includes(error.code))autoPaused=true;
     $('note').textContent=(knownErrors[error&&error.code]||'Falha ao solicitar atualização.')+(autoPaused?' Atualização automática pausada.':'');})
   .finally(()=>{pending=false;$('refresh').disabled=false;$('send').disabled=false});
 }
 ['now','recent','profile'].forEach(n=>$('t-'+n).addEventListener('click',()=>tab(n)));
 $('refresh').addEventListener('click',()=>request('${WIDGET_ACTION.REFRESH}'));
 $('send').addEventListener('click',()=>request(active==='now'?'${WIDGET_ACTION.RICH_NOW}':active==='recent'?'${WIDGET_ACTION.RICH_RECENT}':'${WIDGET_ACTION.PROFILE_HELP}'));
 $('open').addEventListener('click',function(){
   if(!W||!W.openLink){$('note').textContent='Links indisponíveis neste Telegram.';return;}
   if(!state.u||!/^[A-Za-z0-9_-]{2,32}$/.test(state.u)){$('note').textContent='Configure seu perfil com /setuser.';return;}
   W.openLink('https://www.last.fm/user/'+encodeURIComponent(state.u));
 });
 if(W){W.onEvent('chatDataChanged',()=>{const data=parse(W.chatData);render(data);if(data.v===1){updateVersion++;showUpdateStatus();}});
   render(parse(W.chatData));W.ready();
   if(state.k==='rate_limited'||state.k==='invalid_key'||state.k==='suspended_key')autoPaused=true;
   if(W.chatType!=='private'||W.isPreview||W.isForward){$('note').textContent='Atualização automática disponível somente na conversa privada original.';}
   if(!autoPaused && W.chatType==='private' && !W.isPreview && !W.isForward && W.isActive!==false && !document.hidden)request('${WIDGET_ACTION.REFRESH}');
   setInterval(()=>{if(!autoPaused&&!document.hidden&&W.isActive!==false&&!W.isPreview&&!W.isForward&&W.chatType==='private')request('${WIDGET_ACTION.REFRESH}')},30000);
 }else{$('status').textContent='TELEGRAM NECESSÁRIO';$('title').textContent='Abra esta mensagem no Telegram atualizado.'}
})();
</script></body></html>`;
