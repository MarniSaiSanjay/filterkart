// FilterKart popup UI.
// Talks to the background message router via chrome.runtime.sendMessage.
// Shows the current site/search, lets the user save the active filters as a
// named preset, and lists saved presets (matching the current search first)
// with Apply / rename / delete actions.

import { send, el, icon, gaugeIcon, pickIcon, pickColor, timeAgo } from "../ui/ui.js";

const app = document.getElementById("app");
const state = { favIconUrl: null };

// --- error / helpers -------------------------------------------------------

function clear() {
  app.textContent = "";
}

function showError(message) {
  clear();
  app.appendChild(el("p", { class: "error", text: message }));
  app.appendChild(el("button", { class: "text-btn", text: "Retry", onclick: load }));
}

// Suggest a preset name that doesn't collide with an existing one:
// "mobiles" -> "mobiles 2" -> "mobiles 3" ... (case-insensitive).
function uniqueName(base, taken = []) {
  const set = new Set(taken.map((n) => String(n).trim().toLowerCase()));
  const raw = String(base || "").trim();
  // Suggested names get a capitalized first letter; the user can still edit freely.
  const b = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
  if (!b || !set.has(b.toLowerCase())) return b;
  let i = 2;
  while (set.has(`${b} ${i}`.toLowerCase())) i++;
  return `${b} ${i}`;
}

// Settings gear (header) opens the full saved-filters / manager page.
const settingsBtn = document.getElementById("settings-btn");
if (settingsBtn) {
  settingsBtn.appendChild(icon("gear"));
  settingsBtn.addEventListener("click", () => openManager());
}

// --- context card ----------------------------------------------------------

function contextCard(context) {
  const siteIco = state.favIconUrl
    ? el("img", { class: "ctx-fav", src: state.favIconUrl, alt: "" })
    : icon("store", "ctx-ico");

  const site = el("div", { class: "ctx" }, [
    siteIco,
    el("div", { class: "ctx-text" }, [
      el("div", { class: "ctx-title", text: context.label || context.siteId }),
      el("div", { class: "ctx-sub", text: "Current site" }),
    ]),
  ]);

  const search = el("div", { class: "ctx" }, [
    icon("search", "ctx-ico"),
    el("div", { class: "ctx-text" }, [
      el("div", { class: "ctx-title", text: context.search || "\u2014" }),
      el("div", { class: "ctx-sub", text: "Current search" }),
    ]),
  ]);

  return el("div", { class: "context-row" }, [site, el("div", { class: "ctx-divider" }), search]);
}

// --- preset card -----------------------------------------------------------

function presetCard(preset, score) {
  const color = pickColor(preset.id || preset.name);
  const tile = el("div", { class: "preset-icon tile-" + color }, [
    icon(pickIcon(preset.name + " " + preset.search)),
  ]);

  const n = preset.filters.length;
  const when = preset.updatedAt || preset.createdAt;
  const filterLabel = `${n} filter${n === 1 ? "" : "s"}`;
  const meta = when ? `${filterLabel} \u00b7 Updated ${timeAgo(when)}` : filterLabel;

  // Title + inline rename: the pencil toggles the name into an editable input
  // (pencil -> tick, Apply hidden). Tick / Enter saves; Esc cancels.
  const nameEl = el("div", { class: "preset-name", text: preset.name });
  const renameBtn = el("button", { class: "icon-btn rename-btn", title: "Rename" }, [icon("pencil")]);
  const nameRow = el("div", { class: "preset-name-row" }, [nameEl, renameBtn]);

  const bodyChildren = [
    nameRow,
    el("div", { class: "preset-sub" }, [el("span", { text: meta })]),
  ];

  if (typeof score === "number") {
    const strong = score >= 0.999;
    bodyChildren.push(
      el("div", { class: "match " + (strong ? "match-full" : "match-partial") }, [
        strong ? icon("check") : gaugeIcon(score),
        el("span", { text: `${Math.round(score * 100)}% match` }),
      ])
    );
  }

  const apply = el("button", {
    class: "apply-btn",
    text: "Apply",
    onclick: async () => {
      try {
        await send({ type: "apply", id: preset.id });
        window.close();
      } catch (e) {
        showError(e.message);
      }
    },
  });

  const del = el(
    "button",
    {
      class: "icon-btn trash-btn",
      title: "Delete",
      onclick: (ev) => {
        ev.stopPropagation();
        enterConfirm();
      },
    },
    [icon("trash")]
  );

  // Inline delete confirm: clicking the trash swaps Apply + trash for a small
  // "Delete / Cancel" pair (no jarring native confirm dialog).
  const confirmDel = el("button", {
    class: "del-confirm-btn",
    text: "Delete",
    onclick: async (ev) => {
      ev.stopPropagation();
      try {
        await send({ type: "delete", id: preset.id });
        load();
      } catch (e) {
        showError(e.message);
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

  const actions = el("div", { class: "preset-actions" }, [apply, del]);
  function enterConfirm() {
    apply.style.display = "none";
    del.style.display = "none";
    actions.appendChild(confirmGroup);
    confirmDel.focus();
  }
  function exitConfirm() {
    if (confirmGroup.parentNode) actions.removeChild(confirmGroup);
    apply.style.display = "";
    del.style.display = "";
  }

  let input = null;
  function setRenameIcon(name) {
    renameBtn.textContent = "";
    renameBtn.appendChild(icon(name));
  }
  function enterEdit() {
    input = el("input", { type: "text", class: "name-edit", value: preset.name, maxlength: 50 });
    nameRow.replaceChild(input, nameEl);
    setRenameIcon("check");
    renameBtn.title = "Save name";
    renameBtn.classList.add("editing");
    apply.style.display = "none";
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
    if (input) nameRow.replaceChild(nameEl, input);
    input = null;
    setRenameIcon("pencil");
    renameBtn.title = "Rename";
    renameBtn.classList.remove("editing");
    apply.style.display = "";
  }
  async function commitEdit() {
    const name = input.value.trim();
    if (!name || name === preset.name) {
      exitEdit();
      return;
    }
    try {
      await send({ type: "rename", id: preset.id, name });
      load();
    } catch (e) {
      showError(e.message);
    }
  }
  renameBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (input) commitEdit();
    else enterEdit();
  });

  return el("li", { class: "preset spine-" + color }, [
    tile,
    el("div", { class: "preset-body" }, bodyChildren),
    actions,
  ]);
}

// --- save bar --------------------------------------------------------------

function saveBar(context, existingNames) {
  const count = context.filters ? context.filters.length : 0;
  const bar = el("div", { class: "save-bar" });

  const mainBtn = () => {
    const btn = el("button", { class: "save-btn outline full" + (count ? "" : " disabled") }, [
      icon("plus"),
      el("span", { text: "Save Current Filters" }),
    ]);
    if (count) btn.addEventListener("click", showForm);
    else btn.disabled = true;
    return btn;
  };

  function showForm() {
    bar.textContent = "";
    const input = el("input", {
      type: "text",
      class: "name-input",
      placeholder: "Preset name",
      maxlength: 50,
      value: uniqueName(context.search || "", existingNames),
    });
    const confirm = el("button", { class: "save-btn", text: "Save" });
    const cancel = el("button", { class: "text-btn", text: "Cancel" });
    confirm.addEventListener("click", async () => {
      const name = input.value.trim() || context.search;
      if (!name) return input.focus();
      confirm.disabled = true;
      try {
        await send({ type: "save", name });
        load();
      } catch (e) {
        showError(e.message);
        confirm.disabled = false;
      }
    });
    cancel.addEventListener("click", () => {
      bar.textContent = "";
      bar.appendChild(mainBtn());
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirm.click();
    });
    bar.appendChild(
      el("div", { class: "save-form" }, [input, el("div", { class: "save-form-row" }, [cancel, confirm])])
    );
    input.focus();
    input.select();
  }

  bar.appendChild(mainBtn());
  return bar;
}

// --- render ----------------------------------------------------------------

function openManager() {
  const url = chrome.runtime.getURL("src/manager/manager.html");
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
  window.close();
}

function render(data) {
  const { context, matched, others } = data;
  clear();

  if (!context.supported) {
    const known = context.knownSite;
    app.appendChild(
      el("div", { class: "status-card" }, [
        el("div", { class: "status-ico" }, [icon("store")]),
        el("div", {}, [
          el("div", {
            class: "status-title",
            text: known ? `You're on ${known}` : "Unsupported page",
          }),
          el("div", {
            class: "status-desc",
            text: known
              ? `Run a search on ${known} to save or apply FilterKart presets.`
              : "Open Flipkart, Amazon, Myntra or Ajio and run a search to use FilterKart.",
          }),
        ]),
      ])
    );
    return;
  }

  app.appendChild(el("div", { class: "divider" }));
  app.appendChild(contextCard(context));
  app.appendChild(el("div", { class: "divider" }));

  const matchedItems = (matched || []).map((m) => ({ preset: m.preset, score: m.score }));
  const otherItems = (others || []).map((p) => ({ preset: p }));
  const existingNames = [...matchedItems, ...otherItems].map((x) => x.preset.name);

  // The popup only surfaces confident matches for the current search; the full
  // library (all sites, edit/delete) lives on the manager page behind "View all".
  const shown = matchedItems;
  const total = matchedItems.length + otherItems.length;

  const head = el("div", { class: "presets-head" }, [
    el("h2", { class: "section-title", text: "Your Saved Filters" }),
  ]);
  if (total) {
    head.appendChild(
      el("button", { class: "view-all", onclick: openManager }, [
        el("span", { text: "View all" }),
        icon("chevron"),
      ])
    );
  }
  app.appendChild(head);

  if (shown.length) {
    app.appendChild(el("ul", { class: "preset-list" }, shown.map((x) => presetCard(x.preset, x.score))));
  } else if (otherItems.length) {
    // No confident match for this search, but the user has saved presets.
    app.appendChild(
      el("p", { class: "empty-line" }, [
        `No presets match this search. Tap \u201cView all\u201d to manage your saved presets.`,
      ])
    );
  } else {
    app.appendChild(el("p", { class: "empty-line", text: "No saved presets yet for this site." }));
  }

  app.appendChild(
    el("div", { class: "footer" }, [
      saveBar(context, existingNames),
      el("p", { class: "tip" }, [icon("bulb"), el("span", { text: "Tip: Apply filters on the page first, then click \u201cSave\u201d." })]),
    ])
  );
}

async function load() {
  clear();
  app.appendChild(el("p", { class: "muted", text: "Loading\u2026" }));
  try {
    if (chrome.tabs && chrome.tabs.query) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      state.favIconUrl = (tabs && tabs[0] && tabs[0].favIconUrl) || null;
    }
  } catch {
    state.favIconUrl = null;
  }
  try {
    const data = await send({ type: "list" });
    render(data);
  } catch (e) {
    showError(e.message);
  }
}

load();
