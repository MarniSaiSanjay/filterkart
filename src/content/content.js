// FilterKart content script. Injects a style-isolated (shadow DOM) floating
// button on supported result pages for quick Save/Apply, delegating all logic
// to the background message router (stays UI-only).

(function () {
  if (window.__filterKartInjected) return;
  window.__filterKartInjected = true;

  function send(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!res) return reject(new Error("no response"));
        if (!res.ok) return reject(new Error(res.error || "request failed"));
        resolve(res.result);
      });
    });
  }

  // Suggest a preset name that doesn't collide with an existing one, shown with
  // a capitalized first letter: "mobiles" -> "Mobiles" -> "Mobiles 2" ...
  // (case-insensitive; the user can still edit it freely).
  function uniqueName(base, taken) {
    const set = new Set((taken || []).map((n) => String(n).trim().toLowerCase()));
    const raw = String(base || "").trim();
    const b = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
    if (!b || !set.has(b.toLowerCase())) return b;
    let i = 2;
    while (set.has(`${b} ${i}`.toLowerCase())) i++;
    return `${b} ${i}`;
  }

  const host = document.createElement("div");
  host.id = "filterkart-root";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .fab {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    }
    .toggle {
      display: inline-flex; align-items: center; gap: 7px;
      background: #fff; color: #1c1c1e;
      border: 1px solid rgba(60,60,67,0.14); border-radius: 999px;
      padding: 9px 15px; font-size: 13px; font-weight: 600;
      box-shadow: 0 2px 10px rgba(0,0,0,0.12);
      transition: transform 0.12s, background 0.15s;
    }
    .toggle::before {
      content: ""; width: 7px; height: 7px; border-radius: 50%; background: #4f46e5;
    }
    .toggle:hover { transform: translateY(-1px); background: #fafafa; }
    .toggle:active { transform: scale(0.97); }
    .panel {
      position: absolute; right: 0; bottom: 52px; width: 280px;
      background: #fff; color: #1c1c1e;
      border: 1px solid rgba(60,60,67,0.12);
      border-radius: 14px; box-shadow: 0 10px 34px rgba(0,0,0,0.16);
      overflow: hidden; display: none;
    }
    .panel.open { display: block; animation: fc-pop 0.14s ease-out; }
    @keyframes fc-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .title { font-size: 13px; font-weight: 600; margin: 0; padding: 12px 14px; border-bottom: 1px solid rgba(60,60,67,0.12); letter-spacing: -0.01em; }
    .muted { font-size: 12px; color: #8a8a8e; line-height: 1.5; padding: 12px 14px; margin: 0; }
    .row { display: flex; gap: 7px; padding: 12px 14px; border-bottom: 1px solid rgba(60,60,67,0.12); margin: 0; }
    input {
      flex: 1; min-width: 0; padding: 8px 11px; font-size: 12px;
      border: none; border-radius: 8px; background: rgba(120,120,128,0.1);
      transition: box-shadow 0.15s, background 0.15s;
    }
    input:focus { outline: none; background: #fff; box-shadow: 0 0 0 1px rgba(79,70,229,0.4), 0 0 0 3px rgba(79,70,229,0.12); }
    button.act {
      font-size: 12px; font-weight: 600; padding: 8px 12px; border-radius: 8px; cursor: pointer;
      border: none; background: rgba(79,70,229,0.1); color: #4f46e5;
      transition: background 0.15s, transform 0.06s;
    }
    button.act:hover { background: rgba(79,70,229,0.17); }
    button.act:active { transform: scale(0.97); }
    button.act:disabled { opacity: 0.5; cursor: default; }
    button.act.ghost { background: rgba(120,120,128,0.1); color: #1c1c1e; }
    button.act.ghost:hover { background: rgba(120,120,128,0.16); }
    ul { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow: auto; }
    li {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 10px 14px; font-size: 12px;
      border-bottom: 1px solid rgba(60,60,67,0.1);
    }
    li:hover { background: rgba(120,120,128,0.06); }
    li button.act { flex-shrink: 0; }
    .pname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: 13px; }
    .note {
      font-size: 12px; font-weight: 600; line-height: 1.45; margin: 0; padding: 9px 14px;
      color: #c02626; background: rgba(229,72,77,0.08); border-bottom: 1px solid rgba(229,72,77,0.2);
    }
    .toast {
      position: fixed; top: 16px; right: 150px; z-index: 2147483647;
      display: flex; align-items: center; gap: 11px;
      background: rgba(255,255,255,0.92);
      -webkit-backdrop-filter: saturate(1.8) blur(14px); backdrop-filter: saturate(1.8) blur(14px);
      color: #1c1c1e; border: 1px solid rgba(60,60,67,0.1); border-radius: 14px;
      padding: 11px 13px 12px; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 34px rgba(20,20,43,0.16), 0 2px 8px rgba(20,20,43,0.08);
      animation: fk-toast-in 0.42s cubic-bezier(0.22,1,0.36,1);
      transition: gap 0.35s ease, padding 0.35s ease;
    }
    .toast.out { animation: fk-toast-out 0.28s cubic-bezier(0.4,0,1,1) forwards; }
    @keyframes fk-toast-in { from { opacity: 0; transform: translateX(115%) scale(0.96); } to { opacity: 1; transform: none; } }
    @keyframes fk-toast-out { to { opacity: 0; transform: translateX(20%) scale(0.96); } }
    .toast .tmark {
      flex-shrink: 0; width: 34px; height: 34px; border-radius: 9px; overflow: hidden;
      box-shadow: 0 2px 7px rgba(20,20,43,0.22);
    }
    .toast .tmark svg { width: 34px; height: 34px; display: block; }
    .toast .ttext {
      display: flex; flex-direction: column; gap: 1px; min-width: 0;
      max-width: 300px; overflow: hidden;
      transition: max-width 0.35s ease, opacity 0.2s ease, margin 0.35s ease;
    }
    .toast .ttitle { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
    .toast .tsub {
      font-size: 12px; font-weight: 500; color: #8a8a8e;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .toast .tclose {
      flex-shrink: 0; cursor: pointer; border: none; background: none;
      color: #a1a1a6; font-size: 16px; line-height: 1; padding: 3px 5px; border-radius: 7px;
      transition: opacity 0.2s ease, width 0.3s ease, padding 0.3s ease, background 0.15s ease, color 0.15s ease;
    }
    .toast .tclose:hover { background: rgba(120,120,128,0.14); color: #1c1c1e; }
    .toast .tbar {
      position: absolute; left: 0; bottom: 0; height: 2.5px; width: 100%;
      transform-origin: left; border-radius: 2px;
      background: linear-gradient(90deg, #6366f1, #22c55e);
      animation: fk-bar 4.2s linear forwards;
    }
    .toast:hover .tbar { animation-play-state: paused; }
    @keyframes fk-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    .toast.collapsed { gap: 0; padding: 8px; }
    .toast.collapsed .ttext { max-width: 0; opacity: 0; margin: 0; }
    .toast.collapsed .tclose { opacity: 0; width: 0; padding: 0; overflow: hidden; pointer-events: none; }
    .toast.collapsed .tbar { opacity: 0; }
    .toast.dark {
      background: rgba(30,30,33,0.9); color: #f2f2f5; border-color: rgba(255,255,255,0.1);
      box-shadow: 0 12px 36px rgba(0,0,0,0.55);
    }
    .toast.dark .tsub { color: #9a9aa0; }
    .toast.dark .tclose { color: #8e8e93; }
    .toast.dark .tclose:hover { background: rgba(255,255,255,0.12); color: #fff; }
  `;
  root.appendChild(style);

  const fab = document.createElement("div");
  fab.className = "fab";
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = "FilterKart";
  const panel = document.createElement("div");
  panel.className = "panel";
  fab.appendChild(panel);
  fab.appendChild(toggle);
  root.appendChild(fab);

  // Dismissible toast shown after an auto-apply, so the redirect doesn't feel
  // like it "just happened" — it makes clear FilterKart applied a saved filter.
  // It slides in top-right as a rectangle, then collapses into the FilterKart
  // logo badge that lingers briefly before fading.
  // Brand mark as inline SVG (white funnel + tick on the gradient tile) so it
  // stays crisp and high-contrast on the light toast, unlike the light app icon.
  const FK_LOGO_SVG =
    '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="fkLogoGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#22d3bd"/><stop offset="1" stop-color="#4f46e5"/>' +
    "</linearGradient></defs>" +
    '<rect width="40" height="40" rx="11" fill="url(#fkLogoGrad)"/>' +
    '<path transform="translate(8,7)" fill="#fff" d="M22 3 H2 l8 9.46 V19 l4 2 V12.46 z"/>' +
    '<path d="M26.8 28 l2.4 2.4 L34 24.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";
  let toastEl = null;
  let toastTimer = null;
  // Sniff the page colour behind the toast so it stays legible on dark themes:
  // sample the toast's spot, walk up to the first opaque background colour and
  // measure its luminance. Falls back to the browser's colour-scheme when the
  // background is an image/gradient (no readable colour).
  function isDarkBehindToast() {
    try {
      const x = Math.max(0, window.innerWidth - 100);
      let el = document.elementFromPoint(x, 22);
      while (el && el.id !== "filterkart-root") {
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (m) {
          const p = m[1].split(",").map((s) => parseFloat(s.trim()));
          const a = p.length > 3 ? p[3] : 1;
          if (a > 0.5) return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 < 0.5;
        }
        el = el.parentElement;
      }
    } catch {}
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function showToast(name) {
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);

    const t = document.createElement("div");
    t.className = isDarkBehindToast() ? "toast dark" : "toast";
    t.setAttribute("role", "status");

    const mark = document.createElement("span");
    mark.className = "tmark";
    mark.innerHTML = FK_LOGO_SVG;

    const text = document.createElement("div");
    text.className = "ttext";
    const title = document.createElement("span");
    title.className = "ttitle";
    title.textContent = "Filter applied";
    const sub = document.createElement("span");
    sub.className = "tsub";
    sub.textContent = name ? name : "Your saved filter is on";
    text.appendChild(title);
    text.appendChild(sub);

    const close = document.createElement("button");
    close.className = "tclose";
    close.textContent = "\u00D7";
    close.setAttribute("aria-label", "Dismiss");

    const bar = document.createElement("span");
    bar.className = "tbar";

    const HOLD = 4200;
    let done = false;
    const fade = () => {
      t.classList.add("out");
      setTimeout(() => {
        t.remove();
        if (toastEl === t) toastEl = null;
      }, 280);
    };
    // Morph the rectangle into the compact FilterKart logo badge, hold, then fade.
    const collapse = () => {
      if (done) return;
      done = true;
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      t.classList.add("collapsed");
      setTimeout(fade, 1500);
    };
    close.addEventListener("click", collapse);
    // Pause the countdown while hovered (the CSS pauses the bar to match).
    t.addEventListener("mouseenter", () => {
      if (done || !toastTimer) return;
      clearTimeout(toastTimer);
      toastTimer = null;
    });
    t.addEventListener("mouseleave", () => {
      if (done || toastTimer) return;
      // Restart the bar so it stays in lock-step with the fresh countdown.
      bar.style.animation = "none";
      void bar.offsetWidth;
      bar.style.animation = "";
      toastTimer = setTimeout(collapse, HOLD);
    });

    t.appendChild(mark);
    t.appendChild(text);
    t.appendChild(close);
    t.appendChild(bar);
    root.appendChild(t);
    toastEl = t;
    toastTimer = setTimeout(collapse, HOLD);
  }

  async function refresh() {
    panel.textContent = "";
    const heading = document.createElement("p");
    heading.className = "title";
    heading.textContent = "FilterKart";
    panel.appendChild(heading);

    let data;
    try {
      data = await send({ type: "list" });
    } catch (e) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = e.message;
      panel.appendChild(p);
      return;
    }

    const { context, matched, others } = data;
    if (!context.supported) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "This page isn't a supported shopping search.";
      panel.appendChild(p);
      return;
    }

    const count = context.filters ? context.filters.length : 0;
    const existingNames = [
      ...(matched || []).map((m) => m.preset.name),
      ...(others || []).map((p) => p.name),
    ];
    if (count > 0) {
      const row = document.createElement("div");
      row.className = "row";
      const input = document.createElement("input");
      input.placeholder = "Preset name";
      input.maxLength = 50;
      input.value = uniqueName(context.search || "", existingNames).slice(0, 50);
      const save = document.createElement("button");
      save.className = "act";
      save.textContent = "Save";
      save.addEventListener("click", async () => {
        const name = input.value.trim() || context.search;
        if (!name) return input.focus();
        save.disabled = true;
        try {
          await send({ type: "save", name });
          refresh();
        } catch (e) {
          panel.textContent = "";
          const heading = document.createElement("p");
          heading.className = "title";
          heading.textContent = "FilterKart";
          panel.appendChild(heading);
          const note = document.createElement("p");
          note.className = "note";
          note.textContent = e.message;
          panel.appendChild(note);
          const okRow = document.createElement("div");
          okRow.className = "row";
          okRow.style.borderBottom = "none";
          okRow.style.justifyContent = "flex-end";
          const okay = document.createElement("button");
          okay.className = "act";
          okay.textContent = "Okay";
          okay.addEventListener("click", refresh);
          okRow.appendChild(okay);
          panel.appendChild(okRow);
        }
      });
      row.appendChild(input);
      row.appendChild(save);
      panel.appendChild(row);
    } else {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Apply some filters on the page, then save them here.";
      panel.appendChild(p);
    }

    const presets = (matched || []).map((m) => m.preset).concat(others || []);
    if (presets.length) {
      const ul = document.createElement("ul");
      for (const preset of presets) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.className = "pname";
        label.textContent = preset.name;
        const apply = document.createElement("button");
        apply.className = "act ghost";
        apply.textContent = "Apply";
        apply.addEventListener("click", async () => {
          try {
            await send({ type: "apply", id: preset.id });
          } catch (e) {
            apply.textContent = "Error";
          }
        });
        li.appendChild(label);
        li.appendChild(apply);
        ul.appendChild(li);
      }
      panel.appendChild(ul);
    }
  }

  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    if (open) refresh();
  });

  // Live refresh: if presets change elsewhere while this panel is open,
  // re-render so it isn't stale. Reopening already refreshes; debounced.
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    let t = null;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      if (!panel.classList.contains("open")) return;
      if (!Object.keys(changes).some((k) => k.startsWith("preset:"))) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        if (panel.classList.contains("open")) refresh();
      }, 200);
    });
  }

  // Auto-apply: on a bare supported search, redirect once per tab-session to a
  // matching auto-apply preset's filtered URL. sessionStorage keys the guard to
  // this tab + search, so clearing filters mid-session isn't fought. We read
  // storage locally first and only wake the service worker when the global
  // master switch is on and at least one preset is still included.
  let lastAutoUrl = null;
  async function maybeAutoApply() {
    try {
      const url = location.href;
      if (url === lastAutoUrl) return; // no navigation since last check
      lastAutoUrl = url;
      if (!(chrome && chrome.storage && chrome.storage.sync)) return;
      const all = await new Promise((res) => chrome.storage.sync.get(null, res));
      const settings = all.settings && typeof all.settings === "object" ? all.settings : {};
      if (!settings.autoApply) return; // global master switch off
      const hasEligible = Object.keys(all).some(
        (k) => k.startsWith("preset:") && all[k] && all[k].autoApply !== false
      );
      if (!hasEligible) return;
      const res = await send({ type: "autoApplyTarget", url });
      if (!res || !res.url || !res.key || res.url === location.href) return;
      const guard = "fk_autoapply:" + res.key;
      if (sessionStorage.getItem(guard)) return;
      sessionStorage.setItem(guard, "1");
      // Survives the navigation below; read once on the landing page to toast.
      try {
        sessionStorage.setItem("fk_autoapply_toast", res.name || "");
      } catch {}
      location.replace(res.url);
    } catch {}
  }

  // Run on first load, and again whenever the page URL changes. Most supported
  // sites are single-page apps that navigate via the History API without a full
  // reload, so the content script is never re-injected — polling location.href
  // is the reliable way to notice those in-site searches (content scripts run in
  // an isolated world, so patching history.pushState wouldn't see the site's own
  // navigations). The lastAutoUrl check keeps the poll near-free until the URL
  // actually changes.
  maybeAutoApply();
  window.addEventListener("popstate", () => setTimeout(maybeAutoApply, 60));
  window.addEventListener("hashchange", () => setTimeout(maybeAutoApply, 60));
  setInterval(maybeAutoApply, 700);

  // Remove filters: the popup's Remove button asks us to clear the current
  // page's filters (back to a bare search). We set the auto-apply guard first so
  // the bare search we land on isn't immediately re-auto-applied (sessionStorage
  // survives same-tab navigation), then navigate.
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== "fkRemoveFilters") return;
      (async () => {
        try {
          const res = await send({ type: "removeTarget", url: location.href });
          if (!res || !res.url) {
            sendResponse({ ok: false, error: "nothing to remove" });
            return;
          }
          if (res.key) sessionStorage.setItem("fk_autoapply:" + res.key, "1");
          sendResponse({ ok: true });
          setTimeout(() => location.replace(res.url), 0); // let the reply flush
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true; // async response
    });
  }

  document.documentElement.appendChild(host);

  // If we just landed here via an auto-apply redirect, announce it once.
  try {
    const pending = sessionStorage.getItem("fk_autoapply_toast");
    if (pending !== null) {
      sessionStorage.removeItem("fk_autoapply_toast");
      showToast(pending);
    }
  } catch {}
})();