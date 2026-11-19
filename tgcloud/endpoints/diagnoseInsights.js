import { fetch } from 'sdk';
import { LASTFM_API_KEY } from '../lib/lastfm-key.js';
import { createLastfmClient } from '../lib/infrastructure/lastfm-client.js';

// One-time read-only diagnostics. Never logs API keys or full responses.
export default async function () {
 const lastfm=createLastfmClient({request:fetch,apiKey:LASTFM_API_KEY});
 const tasks={
  topsTracks:()=>lastfm.top('rj','tracks','7day',2),
  topsAlbums:()=>lastfm.top('rj','albums','7day',2),
  topsArtists:()=>lastfm.top('rj','artists','7day',2),
  stats:()=>lastfm.info('rj'),
  loved:()=>lastfm.loved('rj',2),
  discover:()=>lastfm.similar('Cher','Believe',2),
 };
 const report={};
 for(const [key,run] of Object.entries(tasks)){
  try {
   const result=await run();
   report[key]={ok:true,count:Array.isArray(result)?result.length:
     Array.isArray(result?.items)?result.items.length:1};
  } catch(error) {
   report[key]={ok:false,kind:error?.kind||'unexpected',apiCode:error?.apiCode||null};
  }
 }
 return report;
}
