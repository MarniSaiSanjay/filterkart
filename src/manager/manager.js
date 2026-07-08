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

// Site logos come from Google's domain-keyed favicon service (S2), which resolves
// any site's real icon on demand and scales as adapters are added. Falls back to
// a coloured monogram tile if the icon can't be fetched.
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
        renderNav();
        renderPanel();
      },
    },
    [
      ico,
      el("span", { class: "nav-label", text: labelFor(site.id) }),
      el("span", { class: "nav-count", text: String(count) }),
    ]
  );
}

function renderNav() {
  nav.textContent = "";
  nav.appendChild(navItem({ id: "all", label: "All presets" }));
  for (const site of state.sites) nav.appendChild(navItem(site));
}

// --- preset cards ----------------------------------------------------------

function filterChips(filters) {
  const wrap = el("div", { class: "chips" });
  const max = 6;
  filters.slice(0, max).forEach((f) => {
    wrap.appendChild(el("span", { class: "chip", text: f.value }));
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
          else window.open(url, "_blank");
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
    input = el("input", { type: "text", class: "name-edit", value: preset.name });
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

  return el("li", { class: "preset spine-" + color }, [
    el("div", { class: "preset-head" }, [
      tile,
      el("div", { class: "preset-body" }, [
        topline,
        el("div", { class: "preset-sub", text: sub }),
        preset.search ? el("div", { class: "preset-search" }, [icon("search"), el("span", { text: preset.search })]) : null,
      ]),
      actions,
    ]),
    preset.filters.length ? filterChips(preset.filters) : null,
  ]);
}

// --- main panel ------------------------------------------------------------

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
  if (state.selected !== "all") {
    const site = state.sites.find((s) => s.id === state.selected);
    if (site) {
      const logo = siteIcon(site);
      logo.classList.add("panel-logo");
      headEl.insertBefore(logo, headEl.firstChild);
    }
  }
  panel.appendChild(headEl);

  if (!items.length) {
    panel.appendChild(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-ico" }, [icon("funnel"), icon("spark", "spark")]),
        el("div", { class: "empty-title", text: "No saved presets here yet" }),
        el("div", {
          class: "empty-desc",
          text:
            state.selected === "all"
              ? "Open a shopping site, apply filters, then use the FilterKart popup to save them."
              : `You haven't saved any ${labelFor(state.selected)} presets yet.`,
        }),
      ])
    );
    return;
  }

  panel.appendChild(el("ul", { class: "preset-list" }, items.map(presetCard)));
}

// --- load ------------------------------------------------------------------

async function load() {
  try {
    const { presets, sites } = await send({ type: "all" });
    state.presets = presets || [];
    state.sites = sites || [];
    if (state.selected !== "all" && !state.sites.some((s) => s.id === state.selected)) {
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
