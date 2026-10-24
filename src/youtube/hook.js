// Personal Blocker — YouTube module. Original code, GPLv3-or-later.
// MAIN world, document_start. Removes ad data from player/page JSON and, as a
// second line of defence, skips any ad that still reaches the player.
(() => {
  if (window.__pbYT) return;
  const stats = window.__pbYT = { v: '0.2.3', pruned: 0, adPlacementsBefore: 0, adPlacementsAfter: 0, playerAdsBefore: 0, adSlotsBefore: 0, renderersRemoved: 0, sources: {},
    adsSeenInPlayer: 0, fallbackSkips: 0, skipClicks: 0, liveSkips: 0, antiAdblockSeen: false, antiAdblockRemoved: 0, jsonParsePruned: 0 };
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams', 'adBreakParams', 'adBreakServiceRenderer', 'liveChatAdRenderer', 'getAdBreakUrl'];
  const AD_RENDERER = /^(adSlotRenderer|promotedSparkles\w*Renderer|promotedVideoRenderer|searchPyvRenderer|bannerPromoRenderer|statementBannerRenderer|compactPromotedVideoRenderer|\w*AdRenderer|\w*AdsRenderer|\w*AdLayoutRenderer|\w*AdSlotRenderer|adSlotMetadata|inFeedAdLayoutRenderer|adPlacementRenderer|playerLegacyDesktopWatchAdsRenderer)$/;
  const isAdKey = k => AD_KEYS.includes(k) || AD_RENDERER.test(k);
  // list item that is (or wraps, one level down) an ad renderer
  const isAdItem = o => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).some(k => AD_RENDERER.test(k) ||
    (o[k] && typeof o[k] === 'object' && o[k].content && typeof o[k].content === 'object' && Object.keys(o[k].content).some(c => AD_RENDERER.test(c))));
  function countAd(o, depth) {
    if (!o || typeof o !== 'object' || depth > 60) return 0;
    let n = 0;
    if (Array.isArray(o)) { for (const x of o) n += countAd(x, depth + 1); return n; }
    for (const k of Object.keys(o)) { if (k === 'adPlacements' || k === 'playerAds' || k === 'adSlots' || /^(adPlacementRenderer|adSlotRenderer|instreamVideoAdRenderer)$/.test(k)) n++; n += countAd(o[k], depth + 1); }
    return n;
  }
  function prune(obj, src) {
    if (!obj || typeof obj !== 'object') return obj;
    stats.sources[src] = (stats.sources[src] || 0) + 1;
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 60) return;
      if (Array.isArray(o)) {
        for (let i = o.length - 1; i >= 0; i--) { if (isAdItem(o[i])) { o.splice(i, 1); stats.renderersRemoved++; } else walk(o[i], depth + 1); }
        return;
      }
      for (const k of Object.keys(o)) {
        if (AD_KEYS.includes(k)) {
          const n = Array.isArray(o[k]) ? o[k].length : 1;
          if (k === 'adPlacements') stats.adPlacementsBefore += n; else if (k === 'playerAds') stats.playerAdsBefore += n; else if (k === 'adSlots') stats.adSlotsBefore += n;
          delete o[k]; stats.pruned++; continue; }
        if (AD_RENDERER.test(k)) { delete o[k]; stats.renderersRemoved++; continue; }
        walk(o[k], depth + 1);
      }
    };
    walk(obj, 0);
    stats.adPlacementsAfter += countAd(obj, 0);
    return obj;
  }
  // 1) initial page globals: trap assignment (and clean a value that already exists, in case we ran late)
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    let v = window[name]; if (v) v = prune(v, name + '-existing');
    try { Object.defineProperty(window, name, { configurable: true, get: () => v, set: x => { v = prune(x, name); } }); } catch (e) {}
  }
  // 2) network JSON: every innertube API response (player, get_watch, next, browse, search, ad_break, reel, live chat ...)
  const MATCH = /\/youtubei\/v1\/(?!log_event|att\/|feedback|stats|account|notification\/(?:record|opt)|visitor_id|share)([\w/]+)/;
  const srcOf = url => { const m = url.match(MATCH); return m && m[1]; };
  const realFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    const resp = await realFetch.apply(this, arguments);
    const src = srcOf(url);
    if (!src) return resp;
    try {
      const j = prune(await resp.clone().json(), src);
      return new Response(JSON.stringify(j), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
    } catch (e) { return resp; }
  };
  const xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) { this.__pbUrl = String(url); return xo.apply(this, arguments); };
  for (const prop of ['responseText', 'response']) {
    const d = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
    Object.defineProperty(XMLHttpRequest.prototype, prop, { configurable: true, get() {
      const raw = d.get.call(this);
      if (!this.__pbUrl || !srcOf(this.__pbUrl) || this.readyState !== 4) return raw;
      if (this.__pbCache) return prop === 'response' && this.responseType === 'json' ? JSON.parse(this.__pbCache) : this.__pbCache;
      try {
        const j = prune(typeof raw === 'string' ? JSON.parse(raw) : raw, 'xhr');
        this.__pbCache = JSON.stringify(j);
        return prop === 'response' && this.responseType === 'json' ? j : this.__pbCache;
      } catch (e) { return raw; }
    } });
  }
  // 2b) catch-all: any innertube-shaped object the page parses itself (covers paths we don't wrap)
  const realParse = JSON.parse;
  const looksInnertube = o => o && typeof o === 'object' && (o.adPlacements || o.playerAds || o.adSlots || o.playerResponse || o.watchNextResponse || (o.responseContext && (o.contents || o.onResponseReceivedActions || o.streamingData)));
  JSON.parse = function (text, reviver) {
    const o = realParse.apply(this, arguments);
    try { if (!reviver && o && typeof o === 'object' && (Array.isArray(o) ? o.some(looksInnertube) : looksInnertube(o))) { stats.jsonParsePruned++; if (stats.jsonParsePruned <= 6) (stats.parseSample = stats.parseSample || []).push(Object.keys(Array.isArray(o) ? o[0] || {} : o).slice(0, 6).join(',') + ' ads=' + countAd(o, 0)); prune(o, 'json.parse'); } } catch (e) {}
    return o;
  };
  // 3) fallback: whenever the player is showing an ad (ad-showing / ad-interrupting), mute it, click Skip,
  //    jump to the end of the ad and run at max speed. Everything is undone as soon as the ad is gone.
  const SKIP = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button, .ytp-ad-skip-button-slot button, button[class*="skip-ad"], .ytp-ad-overlay-close-button, .ytp-ad-survey-skip-button, .ytp-ad-skip-button-text';
  let st = null; // { wasMuted, rate } while an ad is active
  function tick() {
    const p = document.querySelector('#movie_player, .html5-video-player'), v = p && p.querySelector('video.html5-main-video, video');
    // logged-in / anti-adblock enforcement dialog: remove it and resume playback
    const enf = document.querySelector('ytd-enforcement-message-view-model');
    if (enf) {
      stats.antiAdblockSeen = true;
      try {
        const dlg = enf.closest('tp-yt-paper-dialog') || enf; dlg.remove(); stats.antiAdblockRemoved++;
        document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach(e => e.remove());
        document.body.style.removeProperty('overflow'); document.documentElement.style.removeProperty('overflow');
        if (v && v.paused) v.play().catch(() => {});
      } catch (e) {}
    }
    if (!p || !v) return;
    const adOn = p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
    if (!adOn) {
      if (st) { // ad over: restore
        try { v.muted = st.wasMuted; } catch (e) {}
        try { v.playbackRate = st.rate > 0 && st.rate <= 4 ? st.rate : 1; } catch (e) {}
        st = null;
      }
      return;
    }
    if (!st) { st = { wasMuted: v.muted, rate: v.playbackRate }; stats.adsSeenInPlayer++; }
    try { v.muted = true; } catch (e) {}
    const btn = p.querySelector(SKIP) || document.querySelector(SKIP);
    if (btn) { try { btn.click(); stats.skipClicks++; } catch (e) {} }
    try { if (v.playbackRate !== 16) v.playbackRate = 16; } catch (e) {}
    const d = v.duration;
    if (isFinite(d) && d > 0) {
      // A real ad element is short. A long duration means the ad is stitched into the content stream: don't jump to the end of the video.
      if (d <= 600 && v.currentTime < d - 0.25) { try { v.currentTime = d - 0.1; stats.fallbackSkips++; } catch (e) {} }
    } else {
      // live / unknown duration: go to the live edge
      try { if (p.seekToLiveHead) p.seekToLiveHead(); } catch (e) {}
      try { const b = v.buffered; if (b.length && b.end(b.length - 1) - v.currentTime > 1) v.currentTime = b.end(b.length - 1) - 0.5; } catch (e) {}
      stats.liveSkips++;
    }
    if (v.paused) v.play().catch(() => {});
  }
  setInterval(tick, 100);
  // react immediately to the player gaining the ad class
  const attach = () => {
    const p = document.querySelector('#movie_player, .html5-video-player');
    if (!p || p.__pbObs) return;
    p.__pbObs = new MutationObserver(tick); p.__pbObs.observe(p, { attributes: true, attributeFilter: ['class'] });
  };
  setInterval(attach, 1000);
})();
