// Personal Blocker — GPLv3-or-later.
document.getElementById("ver").textContent = "v" + chrome.runtime.getManifest().version;
(async () => {
  const s = await chrome.storage.local.get({ allowlist: [], custom: [], cosmetic: true, twitch: true, youtube: true });
  twitch.checked = s.twitch; youtube.checked = s.youtube;
  allow.value = s.allowlist.join('\n'); custom.value = s.custom.join('\n'); cosmetic.checked = s.cosmetic;
  save.onclick = async () => {
    const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
    await chrome.storage.local.set({ allowlist: lines(allow.value), custom: lines(custom.value), cosmetic: cosmetic.checked, twitch: twitch.checked, youtube: youtube.checked });
    if (youtube.checked) await chrome.permissions.request({ origins: ['*://*.youtube.com/*'] });
    if (twitch.checked) await chrome.permissions.request({ origins: ['*://*.twitch.tv/*'] });
    if (cosmetic.checked) await chrome.permissions.request({ origins: ['<all_urls>'] });
    msg.textContent = 'Saved.';
  };
})();
