// Personal Blocker — GPLv3-or-later. Original code.
const ALLOW_BASE = 1000000; // dynamic rule ids for allowlist
const CUSTOM_BASE = 2000000;
const YT_BASE = 3000000;
// Ad-measurement / ad-request endpoints observed on YouTube watch pages.
const YT_PINGS = ['||youtube.com/api/stats/ads', '||youtube.com/pagead/', '||youtube.com/ptracking', '||youtube.com/get_midroll_',
  '||youtube.com/pcs/activeview', '||googleads.g.doubleclick.net/pagead/', '||www.googleadservices.com/pagead/', '||youtube.com/youtubei/v1/log_event?*adunit'];

async function getState() {
  return Object.assign({ allowlist: [], custom: [], cosmetic: true, twitch: true, youtube: true }, await chrome.storage.local.get(['allowlist', 'custom', 'cosmetic', 'twitch', 'youtube']));
}

async function syncDynamicRules() {
  const { allowlist, custom, youtube } = await getState();
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  const add = [];
  if (allowlist.length) add.push({ id: ALLOW_BASE, priority: 100, action: { type: 'allowAllRequests' },
    condition: { requestDomains: allowlist, resourceTypes: ['main_frame', 'sub_frame'] } });
  custom.forEach((f, i) => { if (f.trim()) add.push({ id: CUSTOM_BASE + i, priority: 3, action: { type: 'block' }, condition: { urlFilter: f.trim() } }); });
  if (youtube && !allowlist.includes('youtube.com')) YT_PINGS.forEach((f, i) => add.push({ id: YT_BASE + i, priority: 3, action: { type: 'block' },
    condition: { urlFilter: f, initiatorDomains: ['youtube.com'] } }));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules: add });
}

async function syncCosmetic() {
  const { cosmetic, allowlist, twitch, youtube } = await getState();
  const has = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const twitchOk = twitch && !allowlist.includes('twitch.tv') &&
    (has || await chrome.permissions.contains({ origins: ['*://*.twitch.tv/*'] }));
  const ytOk = youtube && !allowlist.includes('youtube.com') &&
    (has || await chrome.permissions.contains({ origins: ['*://*.youtube.com/*'] }));
  const YT = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'];
  const want = [];
  if (ytOk) want.push(
    { id: 'yt-hook', matches: YT, js: ['youtube/hook.js'], world: 'MAIN', runAt: 'document_start', allFrames: true, persistAcrossSessions: true },
    { id: 'yt-css', matches: YT, css: ['youtube/hide.css'], runAt: 'document_start', allFrames: true, persistAcrossSessions: true });
  if (twitchOk) want.push(
    { id: 'twitch-hook', matches: ['*://*.twitch.tv/*'], js: ['twitch/hook.js'], world: 'MAIN', runAt: 'document_start', allFrames: true, persistAcrossSessions: true },
    { id: 'twitch-css', matches: ['*://*.twitch.tv/*'], css: ['twitch/hide.css'], runAt: 'document_start', allFrames: true, persistAcrossSessions: true });
  if (has && cosmetic) want.push({
    id: 'cosmetic', matches: ['<all_urls>'], excludeMatches: allowlist.flatMap(d => [`*://${d}/*`, `*://*.${d}/*`]),
    css: ['cosmetic/generic.css'], js: ['content.js'], runAt: 'document_start', allFrames: true, persistAcrossSessions: true });
  // Reconcile instead of unregister-all + register-all: no window with zero scripts, no duplicate-id errors.
  const have = await chrome.scripting.getRegisteredContentScripts();
  const haveIds = new Set(have.map(s => s.id)), wantIds = new Set(want.map(s => s.id));
  const drop = have.filter(s => !wantIds.has(s.id)).map(s => s.id);
  if (drop.length) await chrome.scripting.unregisterContentScripts({ ids: drop });
  const upd = want.filter(s => haveIds.has(s.id)), add = want.filter(s => !haveIds.has(s.id));
  if (upd.length) await chrome.scripting.updateContentScripts(upd);
  if (add.length) await chrome.scripting.registerContentScripts(add);
}

// All syncs run one at a time (storage/permission events fire in bursts and used to race each other).
let chain = Promise.resolve();
function syncAll() {
  chain = chain.then(async () => {
    try { await syncDynamicRules(); } catch (e) { console.warn('rules sync', e); }
    try { await syncCosmetic(); } catch (e) { console.warn('script sync', e); }
  });
  return chain;
}
chrome.runtime.onInstalled.addListener(async () => {
  chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  // One-time migration: the 0.2.0 popup's confusing "ON (turn off)" label left many installs with YouTube/Twitch
  // switched OFF. Turn them back on once when updating to 0.2.2+ (the user can switch them off again afterwards).
  const { migrated022 } = await chrome.storage.local.get('migrated022');
  if (!migrated022) await chrome.storage.local.set({ youtube: true, twitch: true, migrated022: true });
  chrome.action.setTitle({ title: 'Personal Blocker v' + chrome.runtime.getManifest().version });
  syncAll();
});
chrome.runtime.onStartup.addListener(syncAll);
chrome.permissions.onAdded.addListener(syncAll);
chrome.permissions.onRemoved.addListener(syncAll);
chrome.storage.onChanged.addListener(syncAll);
syncAll(); // also every time the service worker wakes up, so a missed install/update event can't leave YouTube unprotected

// ---- self-update: when the updater has copied newer files into this folder, reload onto them ----
const LATEST_URL = 'https://raw.githubusercontent.com/jhodges3401-code/personal-blocker/main/latest.json';
function isNewer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = x[i] || 0, q = y[i] || 0; if (p !== q) return p > q; }
  return false;
}
async function diskVersion() {
  const r = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
  return (await r.json()).version;
}
async function reloadIfDiskNewer() {
  try {
    const disk = await diskVersion(), running = chrome.runtime.getManifest().version;
    if (isNewer(disk, running)) { console.log('Personal Blocker: files on disk are', disk, '- reloading from', running); chrome.runtime.reload(); return true; }
  } catch (e) { console.warn('disk version check', e); }
  return false;
}
chrome.alarms.create('pb-disk-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'pb-disk-check') reloadIfDiskNewer(); });
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'pb-check-disk') { reloadIfDiskNewer().then(r => reply({ reloading: r })); return true; }
});
reloadIfDiskNewer();

// Toolbar icon drawn at runtime (keeps the repo free of binary files).
function drawIcon() {
  try {
    const imageData = {};
    for (const n of [16, 32]) {
      const c = new OffscreenCanvas(n, n), g = c.getContext('2d');
      g.fillStyle = '#c62828'; g.beginPath(); g.moveTo(n / 2, n * 0.05); g.lineTo(n * 0.92, n * 0.2); g.lineTo(n * 0.85, n * 0.62);
      g.lineTo(n / 2, n * 0.97); g.lineTo(n * 0.15, n * 0.62); g.lineTo(n * 0.08, n * 0.2); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${Math.round(n * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', n / 2, n * 0.5);
      imageData[n] = g.getImageData(0, 0, n, n);
    }
    chrome.action.setIcon({ imageData });
  } catch (e) { /* default icon is fine */ }
}
drawIcon();
