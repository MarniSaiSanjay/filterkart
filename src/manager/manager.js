// FilterKart manager page.
// A full-tab library of every saved preset with a left sidebar of sites.
// Selecting a site shows its presets with Open / Rename / Delete actions.
import { send, el, icon, pickIcon, pickColor, timeAgo } from "../ui/ui.js";

const nav = document.getElementById("nav");
const panel = document.getElementById("panel");

const state = {
  presets: [],
  sites: [], // [{ id, label }]
  selected: "all",
  page: 1,
  globalAuto: false,
};

function countFor(siteId) {
  if (siteId === "all") return state.presets.length;
  return state.presets.filter((p) => p.siteId === siteId).length;
}

function labelFor(siteId) {
  if (siteId === "all") return "All presets";
  const s = state.sites.find((x) => x.id === siteId);
  return s ? s.label : siteId;
}

// --- sidebar ---------------------------------------------------------------

// Coloured monogram tile (first letter) — the favicon fallback.
function applyMonogram(wrap, site) {
  wrap.textContent = String(site.label || "?").trim().charAt(0).toUpperCase();
  wrap.classList.add("nav-mono", "tile-" + pickColor(site.id || site.label));
}

function siteIcon(site) {
  const wrap = el("span", { class: "nav-ico" });
  let host = null;
  try {
    host = site && site.home ? new URL(site.home).hostname.replace(/^www\./, "") : null;
  } catch {
    host = null;
  }
  if (!host) {
    applyMonogram(wrap, site);
    return wrap;
  }
  const img = el("img", {
    class: "nav-fav",
    src: `https://www.google.com/s2/favicons?sz=64&domain=${host}`,
    alt: "",
  });
  img.addEventListener("error", () => {
    wrap.textContent = "";
    applyMonogram(wrap, site);
  });
  wrap.appendChild(img);
  return wrap;
}

function navItem(site) {
  const isAll = site.id === "all";
  const count = countFor(site.id);
  const ico = isAll ? el("span", { class: "nav-ico" }, [icon("layers")]) : siteIcon(site);
  return el(
    "button",
    {
      class: "nav-item" + (state.selected === site.id ? " active" : ""),
      onclick: () => {
        state.selected = site.id;
        state.page = 1;
        renderNav();
        renderPanel();
      },
    },
    [
      ico,
      el("span", { class: "nav-label", text: labelFor(site.id) }),
      countBadge(count, isAll),
    ]
  );
}

// Site badges cap at "99+" (real count in the tooltip); "All presets" is uncapped.
function countBadge(count, isAll) {
  const capped = !isAll && count > 99;
  const badge = el("span", { class: "nav-count", text: capped ? "99+" : String(count) });
  if (capped) badge.title = `${count} presets`;
  return badge;
}

function renderNav() {
  nav.textContent = "";
  nav.appendChild(navItem({ id: "all", label: "All presets" }));
  // Sidebar shows only used sites (>=1 preset), most-used first, ties by label.
  const used = state.sites
    .filter((s) => countFor(s.id) > 0)
    .sort((a, b) => {
      const diff = countFor(b.id) - countFor(a.id);
      return diff !== 0 ? diff : labelFor(a.id).localeCompare(labelFor(b.id));
    });
  for (const site of used) nav.appendChild(navItem(site));
  // Unused sites hide behind the "＋" discovery affordance, but only once at
  // least one site is used; first-run surfaces them in the empty state instead.
  const unused = state.sites.filter((s) => countFor(s.id) === 0);
  if (used.length && unused.length) nav.appendChild(discoveryAffordance(unused));
}

// A small avatar-stack + "＋" row pinned under the used-site list. With several
// unused sites it opens a popover listing them all; with a single one left it
// shows that site's name and opens its home page directly (no popover).
function discoveryAffordance(unused) {
  const wrap = el("div", { class: "nav-add-wrap" });
  const single = unused.length === 1;
  const stack = el(
    "span",
    { class: "add-stack" },
    unused.slice(0, 3).map((s) => {
      const ic = siteIcon(s);
      ic.classList.add("add-mini");
      return ic;
    })
  );
  const btn = el(
    "button",
    {
      class: "nav-item nav-add",
      title: single ? `Open ${unused[0].label}` : "Discover more supported sites",
      onclick: (ev) => {
        ev.stopPropagation();
        if (single) window.open(unused[0].home || "#", "_blank", "noopener");
        else toggleAddPopover(wrap, unused);
      },
    },
    [
      el("span", { class: "nav-ico add-plus" }, [icon("plus")]),
      el("span", { class: "nav-label", text: single ? `Add ${unused[0].label}` : "More sites" }),
      stack,
    ]
  );
  wrap.appendChild(btn);
  return wrap;
}

function toggleAddPopover(wrap, unused) {
  const open = wrap.querySelector(".add-pop");
  if (open) {
    open.remove();
    return;
  }
  const items = unused.map((s) => {
    const ic = siteIcon(s);
    ic.classList.add("add-mini");
    return el(
      "a",
      {
        class: "add-pop-item",
        href: s.home || "#",
        target: "_blank",
        rel: "noopener",
        title: `Open ${s.label}`,
      },
      [ic, el("span", { text: s.label })]
    );
  });
  const pop = el("div", { class: "add-pop" }, [
    el("div", { class: "add-pop-head", text: "Also supported" }),
    ...items,
  ]);
  wrap.appendChild(pop);
  // Dismiss on outside click or Esc (deferred so this same click doesn't close
  // it). Mirrors the rename/delete editors which also honor Esc.
  setTimeout(() => {
    const close = () => {
      pop.remove();
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    const onDoc = (e) => {
      if (!wrap.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
}

// --- preset cards ----------------------------------------------------------

function filterChips(filters) {
  const wrap = el("div", { class: "chips" });
  const max = 6;
  filters.slice(0, max).forEach((f) => {
    wrap.appendChild(el("span", { class: "chip", text: f.value, title: f.value }));
  });
  if (filters.length > max) {
    wrap.appendChild(el("span", { class: "chip more", text: `+${filters.length - max} more` }));
  }
  return wrap;
}

function presetCard(preset) {
  const color = pickColor(preset.id || preset.name);
  const tile = el("div", { class: "preset-icon tile-" + color }, [
    icon(pickIcon(preset.name + " " + preset.search)),
  ]);

  const n = preset.filters.length;
  const stamp = el("span", {
    class: "stamp",
    title: `${n} filter${n === 1 ? "" : "s"}`,
    text: `\u00d7${n}`,
  });

  const when = preset.updatedAt || preset.createdAt;
  const sub =
    (state.selected === "all" ? labelFor(preset.siteId) : `${n} filter${n === 1 ? "" : "s"}`) +
    (when ? ` \u00b7 Updated ${timeAgo(when)}` : "");

  const nameEl = el("div", { class: "preset-name", text: preset.name });
  const topline = el("div", { class: "preset-topline" }, [nameEl, stamp]);

  const open = el(
    "button",
    {
      class: "act open",
      title: "Open with these filters",
      onclick: async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          const { url } = await send({ type: "buildUrl", id: preset.id });
          if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
          else window.open(url, "_blank", "noopener");
        } catch (e) {
          alert(e.message);
        } finally {
          btn.disabled = false;
        }
      },
    },
    [icon("external"), el("span", { text: "Open" })]
  );

  const renameBtn = el("button", { class: "act ghost", title: "Rename" }, [icon("pencil")]);
  const del = el(
    "button",
    {
      class: "act ghost danger",
      title: "Delete",
      onclick: (ev) => {
        ev.stopPropagation();
        enterConfirm();
      },
    },
    [icon("trash")]
  );
  const actions = el("div", { class: "preset-actions" }, [open, renameBtn, del]);

  // Inline delete confirm: the trash swaps the actions for a Delete/Cancel pair.
  const confirmDel = el("button", {
    class: "del-confirm-btn",
    text: "Delete",
    onclick: async (ev) => {
      ev.stopPropagation();
      try {
        await send({ type: "delete", id: preset.id });
        await load();
      } catch (e) {
        alert(e.message);
      }
    },
  });
  const cancelDel = el("button", {
    class: "del-cancel-btn",
    text: "Cancel",
    onclick: (ev) => {
      ev.stopPropagation();
      exitConfirm();
    },
  });
  const confirmGroup = el("div", { class: "del-confirm" }, [confirmDel, cancelDel]);
  confirmGroup.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      exitConfirm();
    }
  });
  function enterConfirm() {
    open.style.display = "none";
    renameBtn.style.display = "none";
    del.style.display = "none";
    actions.appendChild(confirmGroup);
    confirmDel.focus();
  }
  function exitConfirm() {
    if (confirmGroup.parentNode) actions.removeChild(confirmGroup);
    open.style.display = "";
    renameBtn.style.display = "";
    del.style.display = "";
  }

  // Inline rename: the pencil toggles the name into an editable input
  // (pencil -> tick). Tick / Enter saves; Esc cancels.
  let input = null;
  function setRenameIcon(name) {
    renameBtn.textContent = "";
    renameBtn.appendChild(icon(name));
  }
  function enterEdit() {
    input = el("input", { type: "text", class: "name-edit", value: preset.name, maxlength: 50 });
    topline.replaceChild(input, nameEl);
    setRenameIcon("check");
    renameBtn.title = "Save name";
    renameBtn.classList.add("editing");
    open.style.display = "none";
    del.style.display = "none";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitEdit();
      }
    });
    input.focus();
    input.select();
  }
  function exitEdit() {
    if (input) topline.replaceChild(nameEl, input);
    input = null;
    setRenameIcon("pencil");
    renameBtn.title = "Rename";
    renameBtn.classList.remove("editing");
    open.style.display = "";
    del.style.display = "";
  }
  async function commitEdit() {
    const name = input.value.trim();
    if (!name || name === preset.name) {
      exitEdit();
      return;
    }
    try {
      await send({ type: "rename", id: preset.id, name });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }
  renameBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (input) commitEdit();
    else enterEdit();
  });

  // Per-preset auto-apply toggle — an opt-out exception, shown only while the
  // global switch is on (off = the whole feature is dormant, so no per-card UI).
  let autoRow = null;
  if (state.globalAuto) {
    const autoToggle = el("input", { type: "checkbox", class: "auto-toggle" });
    autoToggle.checked = preset.autoApply !== false;
    autoToggle.addEventListener("change", async () => {
      const val = autoToggle.checked;
      try {
        await send({ type: "setAutoApply", id: preset.id, value: val });
        preset.autoApply = val;
      } catch (e) {
        autoToggle.checked = !val;
        alert(e.message);
      }
    });
    autoRow = el(
      "label",
      { class: "auto-row", title: "Redirect to these filters when you search this on the site" },
      [
        autoToggle,
        el("span", { class: "auto-switch" }),
        el("span", { class: "auto-label", text: "Auto-apply on this search" }),
      ]
    );
  }

  return el("li", { class: "preset spine-" + color }, [
    el("div", { class: "preset-head" }, [
      tile,
      el("div", { class: "preset-body" }, [
        topline,
        el("div", { class: "preset-sub", text: sub }),
        preset.search ? el("div", { class: "preset-search" }, [icon("search"), el("span", { text: preset.search, title: preset.search })]) : null,
        autoRow,
      ]),
      actions,
    ]),
    preset.filters.length ? filterChips(preset.filters) : null,
  ]);
}

// --- main panel ------------------------------------------------------------

// "Works on" grid of site chips for the first-run empty state; each chip opens
// that site's home page in a new tab.
function supportedSitesHint() {
  if (!state.sites.length) return null;
  const chips = state.sites.map((site) => {
    const logo = siteIcon(site);
    logo.classList.add("supported-ico");
    return el(
      "a",
      {
        class: "supported-chip",
        href: site.home || "#",
        target: "_blank",
        rel: "noopener",
        title: `Open ${site.label}`,
      },
      [logo, el("span", { text: site.label })]
    );
  });
  return el("div", { class: "supported" }, [
    el("div", { class: "supported-label", text: "Works on" }),
    el("div", { class: "supported-row" }, chips),
  ]);
}

// Windowed page numbers: 1..N when small, else 1 … cur-1 cur cur+1 … N.
function pageList(total, cur) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("gap");
  out.push(total);
  return out;
}

// Numbered pagination bar: ‹ 1 … 4 5 6 … 20 ›
function pager(total, cur, go) {
  const arrow = (name, to, disabled, label) => {
    if (disabled) return null; // show prev/next only when there's somewhere to go
    const b = el("button", { class: "pager-btn pager-arrow", title: label }, [icon(name)]);
    b.addEventListener("click", () => go(to));
    return b;
  };
  const kids = [arrow("chevron-left", cur - 1, cur <= 1, "Previous")];
  for (const p of pageList(total, cur)) {
    if (p === "gap") {
      kids.push(el("span", { class: "pager-gap", text: "\u2026" }));
      continue;
    }
    const b = el("button", { class: "pager-btn" + (p === cur ? " active" : ""), text: String(p) });
    if (p === cur) b.setAttribute("aria-current", "page");
    else b.addEventListener("click", () => go(p));
    kids.push(b);
  }
  kids.push(arrow("chevron", cur + 1, cur >= total, "Next"));
  return el("nav", { class: "pager", "aria-label": "Pagination" }, kids);
}

// Library-wide auto-apply controls: the global master switch plus bulk
// enable/disable of the per-preset flags (bulk links only while global is on).
function autoBar() {
  const masterToggle = el("input", { type: "checkbox", class: "auto-toggle" });
  masterToggle.checked = state.globalAuto;
  masterToggle.addEventListener("change", async () => {
    const val = masterToggle.checked;
    try {
      await send({ type: "setGlobalAutoApply", value: val });
      state.globalAuto = val;
      renderPanel();
    } catch (e) {
      masterToggle.checked = !val;
      alert(e.message);
    }
  });
  const master = el(
    "label",
    { class: "master-row", title: "Redirect matching searches to your saved filters automatically" },
    [
      masterToggle,
      el("span", { class: "auto-switch" }),
      el("div", { class: "master-text" }, [
        el("span", { class: "master-label", text: "Auto-apply saved filters" }),
        el("span", {
          class: "master-hint",
          text: state.globalAuto
            ? "On \u2014 matching searches jump to saved filters"
            : "Off \u2014 apply filters manually",
        }),
      ]),
    ]
  );

  const bar = el("div", { class: "auto-bar" }, [master]);
  if (state.globalAuto) {
    const bulkAll = (value) => async () => {
      try {
        await send({ type: "setAllAutoApply", value });
        await load();
      } catch (e) {
        alert(e.message);
      }
    };
    bar.appendChild(
      el("div", { class: "bulk-row" }, [
        el("button", { class: "bulk-link", text: "Enable all", onclick: bulkAll(true) }),
        el("span", { class: "bulk-sep", text: "\u00b7" }),
        el("button", { class: "bulk-link", text: "Disable all", onclick: bulkAll(false) }),
      ])
    );
  }
  return bar;
}

function renderPanel() {
  panel.textContent = "";
  const items = state.presets
    .filter((p) => state.selected === "all" || p.siteId === state.selected)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  const headEl = el("div", { class: "panel-head" }, [
    el("h2", { text: labelFor(state.selected) }),
    el("span", {
      class: "panel-count",
      text: `${items.length} preset${items.length === 1 ? "" : "s"}`,
    }),
  ]);
  const tools = el("div", { class: "panel-tools" }, [
    el(
      "button",
      { class: "tool-btn", title: "Download all presets as a JSON backup", onclick: exportPresets },
      [icon("external"), el("span", { text: "Export" })]
    ),
    el(
      "button",
      { class: "tool-btn", title: "Import presets from a JSON backup", onclick: triggerImport },
      [icon("plus"), el("span", { text: "Import" })]
    ),
  ]);
  if (!state.presets.length) tools.firstChild.disabled = true; // nothing to export yet
  headEl.appendChild(tools);
  if (state.selected !== "all") {
    const site = state.sites.find((s) => s.id === state.selected);
    if (site) {
      const logo = siteIcon(site);
      logo.classList.add("panel-logo");
      headEl.insertBefore(logo, headEl.firstChild);
    }
  }
  panel.appendChild(headEl);

  if (state.presets.length) panel.appendChild(autoBar());

  if (!items.length) {
    const empty = el("div", { class: "empty" }, [
      el("div", { class: "empty-ico" }, [icon("funnel"), icon("spark", "spark")]),
      el("div", { class: "empty-title", text: "No saved presets here yet" }),
      el("div", {
        class: "empty-desc",
        text:
          state.selected === "all"
            ? "Open a shopping site, apply filters, then use the FilterKart popup to save them."
            : `You haven't saved any ${labelFor(state.selected)} presets yet.`,
      }),
    ]);
    const hint = state.selected === "all" ? supportedSitesHint() : null;
    if (hint) empty.appendChild(hint);
    panel.appendChild(empty);
    return;
  }

  const PER_PAGE = 10;
  const totalPages = Math.ceil(items.length / PER_PAGE);
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = (state.page - 1) * PER_PAGE;
  const pageItems = items.slice(start, start + PER_PAGE);

  panel.appendChild(el("ul", { class: "preset-list" }, pageItems.map(presetCard)));
  if (totalPages > 1) {
    panel.appendChild(
      pager(totalPages, state.page, (p) => {
        state.page = p;
        renderPanel();
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
    );
  }
}

// --- export / import (backup) ----------------------------------------------

// Show a brief status toast; survives the panel re-render that import triggers.
let toastTimer = null;
function toast(msg, isError) {
  let t = document.getElementById("fk-toast");
  if (!t) {
    t = el("div", { class: "fk-toast" });
    t.id = "fk-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// Export the whole library (all sites) to a JSON file. The id is dropped so an
// import always mints fresh ids and never collides with existing presets.
function exportPresets() {
  if (!state.presets.length) return;
  const data = {
    app: "filterkart",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: state.presets.map((p) => ({
      name: p.name,
      siteId: p.siteId,
      canonicalCategory: p.canonicalCategory,
      search: p.search,
      filters: p.filters,
      meta: p.meta || null,
      autoApply: p.autoApply !== false,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", {
    href: url,
    download: `filterkart-presets-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function triggerImport() {
  const input = el("input", { type: "file", accept: "application/json,.json" });
  input.style.display = "none";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (file) await importFromFile(file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

async function importFromFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast("That file isn't valid JSON.", true);
  }
  const presets = Array.isArray(data)
    ? data
    : data && Array.isArray(data.presets)
      ? data.presets
      : null;
  if (!presets) return toast("No presets found in that file.", true);
  try {
    const { added, skipped } = await send({ type: "importPresets", presets });
    toast(added ? `Imported ${added}${skipped ? ` \u00b7 skipped ${skipped}` : ""}.` : "Nothing new to import.");
    await load();
  } catch (e) {
    toast(e.message, true);
  }
}

// --- load ------------------------------------------------------------------

async function load() {
  try {
    const [{ presets, sites }, settings] = await Promise.all([
      send({ type: "all" }),
      send({ type: "getSettings" }).catch(() => ({ settings: {} })),
    ]);
    state.presets = presets || [];
    state.sites = sites || [];
    state.globalAuto = !!(settings && settings.settings && settings.settings.autoApply);
    if (state.selected !== "all" && countFor(state.selected) === 0) {
      state.selected = "all";
    }
    renderNav();
    renderPanel();
  } catch (e) {
    panel.textContent = "";
    panel.appendChild(el("p", { class: "error", text: e.message }));
    panel.appendChild(el("button", { class: "act ghost", text: "Retry", onclick: load }));
  }
}

load();

// Live refresh: reload when presets change in another surface (popup, in-page
// panel, or a 2nd manager tab). Debounced since one edit can touch several keys.
let reloadTimer = null;
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    load();
  }, 200);
}
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (Object.keys(changes).some((k) => k.startsWith("preset:") || k === "settings")) scheduleReload();
  });
}

const yearEl = document.getElementById("foot-year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());
