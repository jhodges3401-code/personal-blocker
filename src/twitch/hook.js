// Personal Blocker — Twitch module. Original code, GPLv3-or-later.
// Runs in the page (MAIN world). Wraps fetch and Worker so that HLS media
// playlists can be cleaned of server-side-inserted ad segments.
(() => {
  if (window.__pbTwitch) return; window.__pbTwitch = true;
  // Prefer Source (1080p) quality on first visit only; never overwrite a choice
  // the user made in Twitch's own quality menu ("chunked" = Source).
  try { if (!localStorage.getItem('video-quality')) localStorage.setItem('video-quality', JSON.stringify({ default: 'chunked' })); } catch (e) {}
  // ---- shared playlist logic (also serialized into workers) ----
  function pbCore(scope) {
    const bc = new BroadcastChannel('pb-twitch');
    const variants = []; // [{url, res}] from the last master playlist
    const stats = { playlists: 0, adPlaylists: 0, stripped: 0, fallbacks: 0 };
    // Quality policy: never downgrade. A fully ad-only playlist is passed through
    // unchanged and the page mutes + shows a notice; the player stays on the
    // quality it chose. Set true only to allow a temporary per-request lower-quality
    // substitute during an ad break (it ends automatically on the next clean playlist).
    const ALLOW_LOWER_QUALITY_FALLBACK = false;
    const isAdLine = l => /stitched-ad|twitch-stitched|CLASS="twitch-ad/i.test(l);
    const report = (type, extra) => bc.postMessage(Object.assign({ type, stats }, extra || {}));
    function parseMaster(text, base) {
      variants.length = 0; const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const res = (lines[i].match(/RESOLUTION=\d+x(\d+)/) || [])[1] | 0;
        const u = (lines[i + 1] || '').trim(); if (u) variants.push({ url: new URL(u, base).href, res });
      }
      variants.sort((a, b) => a.res - b.res);
    }
    function hasAds(text) { return text.split('\n').some(isAdLine); }
    // Drop segments that belong to an ad: Twitch labels live segments' EXTINF
    // title "live"; inserted ad segments carry a different title.
    function strip(text) {
      const out = [], lines = text.split('\n'); let dropNext = false, kept = 0, dropped = 0;
      for (const l of lines) {
        if (isAdLine(l)) continue;
        if (l.startsWith('#EXTINF')) { dropNext = !/,\s*live\s*$/i.test(l) ; if (dropNext) { dropped++; continue; } kept++; out.push(l); continue; }
        if (dropNext && l && !l.startsWith('#')) { dropNext = false; continue; }
        if (l.startsWith('#EXT-X-PROGRAM-DATE-TIME') && dropNext) continue;
        out.push(l);
      }
      return { text: out.join('\n'), kept, dropped };
    }
    const realFetch = scope.fetch.bind(scope);
    scope.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const resp = await realFetch(input, init);
      if (!/\.m3u8(\?|$)/.test(url) && !/usher\.ttvnw\.net/.test(url)) return resp;
      try {
        let text = await resp.clone().text();
        if (text.includes('#EXT-X-STREAM-INF')) { parseMaster(text, url); return resp; }
        if (!text.includes('#EXTINF')) return resp;
        stats.playlists++;
        if (!hasAds(text)) { report('clean'); return resp; }
        stats.adPlaylists++;
        let r = strip(text);
        if (r.kept === 0 && ALLOW_LOWER_QUALITY_FALLBACK) {
          // all segments are ads: try other (lower) qualities that are ad-free
          for (const v of variants) {
            if (v.url === url) continue;
            try { const t = await (await realFetch(v.url)).text(); if (!hasAds(t) && t.includes('#EXTINF')) { stats.fallbacks++; text = t; r = { text: t, kept: 1, dropped: 0, fallback: v.res }; break; } } catch {}
          }
        }
        stats.stripped += r.dropped;
        report(r.kept === 0 ? 'ad-unavoidable' : 'ad-stripped', { fallback: r.fallback });
        if (r.kept === 0) return resp; // let it play; page mutes + shows notice
        return new Response(r.text, { status: resp.status, headers: resp.headers });
      } catch (e) { return resp; }
    };
  }
  pbCore(window);
  // ---- Worker wrap: inject core into Twitch's player worker ----
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(url, opts) {
      let u = String(url);
      try {
        const abs = new URL(u, location.href).href;
        const src = `(${pbCore.toString()})(self);\nimportScripts(${JSON.stringify(abs)});`;
        u = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      } catch (e) {}
      super(u, opts);
    }
  };
  // ---- page side: mute + notice fallback ----
  const bc = new BroadcastChannel('pb-twitch');
  let note, mutedByUs = false, lastAd = 0;
  window.__pbTwitchStats = {};
  bc.onmessage = ({ data }) => {
    window.__pbTwitchStats = Object.assign({}, data.stats, { last: data.type });
    const v = document.querySelector('video');
    if (data.type === 'ad-unavoidable') {
      lastAd = Date.now();
      if (v && !v.muted) { v.muted = true; mutedByUs = true; }
      if (!note) { note = document.createElement('div'); note.textContent = 'Personal Blocker: blocking ad…';
        note.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;padding:8px 14px;border-radius:6px;font:14px sans-serif';
        document.documentElement.appendChild(note); }
    } else if (data.type === 'clean' && Date.now() - lastAd > 3000) {
      if (mutedByUs && v) { v.muted = false; mutedByUs = false; }
      if (note) { note.remove(); note = null; }
    }
  };
})();
