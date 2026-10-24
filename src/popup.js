// Personal Blocker — GPLv3-or-later.
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = ''; try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  document.getElementById('host').textContent = host || '(no site)';
  try { const n = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
    document.getElementById('count').textContent = n.rulesMatchedInfo.filter(r => r.rule.rulesetId !== '_dynamic').length; } catch {}
  const st = await chrome.storage.local.get({ allowlist: [] });
  const t = document.getElementById('toggle');
  const on = !st.allowlist.includes(host);
  t.textContent = on ? 'Pause on this site' : 'Resume on this site';
  t.onclick = async () => {
    const list = on ? [...st.allowlist, host] : st.allowlist.filter(d => d !== host);
    await chrome.storage.local.set({ allowlist: list }); chrome.tabs.reload(tab.id); window.close();
  };
  const has = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  document.getElementById('mode').textContent = has ? 'Optimal (network + cosmetic)' : 'Basic (network only)';
  const p = document.getElementById('perm');
  if (has) p.style.display = 'none';
  p.onclick = () => chrome.permissions.request({ origins: ['<all_urls>'] });
  const tw = document.getElementById('twitch');
  const ts = await chrome.storage.local.get({ twitch: true });
  tw.textContent = ts.twitch ? 'Twitch ad blocking: ON (turn off)' : 'Twitch ad blocking: OFF (turn on)';
  tw.onclick = async () => { if (!ts.twitch) await chrome.permissions.request({ origins: ['*://*.twitch.tv/*'] });
    await chrome.storage.local.set({ twitch: !ts.twitch }); window.close(); };
  const yb = document.getElementById('youtube');
  const ys = await chrome.storage.local.get({ youtube: true });
  const hasYT = await chrome.permissions.contains({ origins: ['*://*.youtube.com/*'] });
  const ids = (await chrome.scripting.getRegisteredContentScripts()).map(s => s.id);
  const active = ys.youtube && ids.includes('yt-hook');
  yb.textContent = active ? 'YouTube ad blocking: ON (turn off)' : (ys.youtube ? 'YouTube ad blocking: NOT ACTIVE - click to fix' : 'YouTube ad blocking: OFF (turn on)');
  yb.onclick = async () => {
    if (!active) { await chrome.permissions.request({ origins: ['*://*.youtube.com/*'] }); await chrome.storage.local.set({ youtube: true }); }
    else await chrome.storage.local.set({ youtube: false });
    window.close(); };
  const running = chrome.runtime.getManifest().version;
  document.getElementById('ver').textContent = 'v' + running;
  chrome.runtime.sendMessage({ type: 'pb-check-disk' }).catch(() => {});
  const up = document.getElementById('upd');
  try {
    const j = await (await fetch('https://raw.githubusercontent.com/jhodges3401-code/personal-blocker/main/latest.json', { cache: 'no-store' })).json();
    const nv = String(j.version).split('.').map(Number), rv = running.split('.').map(Number);
    let newer = false; for (let i = 0; i < 3; i++) { if ((nv[i] || 0) !== (rv[i] || 0)) { newer = (nv[i] || 0) > (rv[i] || 0); break; } }
    up.textContent = newer ? 'Update available (v' + j.version + ') - run Update Personal Blocker' : 'Up to date';
    up.style.color = newer ? '#b00' : '#070';
  } catch (e) { up.textContent = 'Could not check for updates'; }
})();
