// Personal Blocker — GPLv3-or-later. Domain-specific cosmetic hiding.
(async () => {
  try {
    const data = await (await fetch(chrome.runtime.getURL('cosmetic/specific.json'))).json();
    const parts = location.hostname.toLowerCase().split('.');
    const hide = [], unhide = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts.slice(i).join('.');
      if (data.hide[d]) hide.push(...data.hide[d]);
      if (data.unhide[d]) unhide.push(...data.unhide[d]);
    }
    let css = '';
    for (const s of hide) css += `${s}{display:none!important}\n`;
    for (const s of unhide) css += `html ${s}{display:revert!important}\n`;
    if (!css) return;
    const st = document.createElement('style'); st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { /* ignore */ }
})();
