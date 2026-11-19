/** LRCLIB public lyrics lookup adapted from myJAM's /tly.
 * Show only a short preview; never reprint an entire copyrighted lyric.
 */
export function createLyricsClient({request}) {
  if(typeof request!=='function') throw new TypeError('HTTP request ausente');
  const normalize=x=>String(x||'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return Object.freeze({
    async preview(artist,track) {
      if(!artist||!track) return {status:'missing',excerpt:''};
      const url='https://lrclib.net/api/search?artist_name='+encodeURIComponent(artist)+
        '&track_name='+encodeURIComponent(track);
      let res;
      try {res=await request(url,{headers:{'User-Agent':'widgettrobot/2.3 (+https://github.com/fritesjonas-ai/widgettrobot)'}});}
      catch {return {status:'unavailable',excerpt:''};}
      if(!res?.ok) return {status:'unavailable',excerpt:''};
      let rows;
      try {rows=await res.json();}catch{return {status:'unavailable',excerpt:''};}
      if(!Array.isArray(rows)) return {status:'unavailable',excerpt:''};
      const exact=rows.find(x=>normalize(x?.artistName)===normalize(artist)&&
        normalize(x?.trackName)===normalize(track));
      if(!exact)return {status:'missing',excerpt:''};
      if(exact.instrumental)return {status:'instrumental',excerpt:''};
      const text=typeof exact.plainLyrics==='string'?exact.plainLyrics:'';
      const words=text.split(/\s+/).filter(Boolean).slice(0,10);
      return words.length?{status:'preview',excerpt:words.join(' ')}:{status:'missing',excerpt:''};
    },
  });
}
