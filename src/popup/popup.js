// FilterCart popup UI.
// Talks to the background message router via chrome.runtime.sendMessage.
// Shows the current site/search, lets the user save the active filters as a
// named preset, and lists saved presets (matching the current search first)
// with Apply / rename / delete actions.

const app = document.getElementById("app");

function send(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) return reject(new Error(lastErr.message));
      if (!res) return reject(new Error("no response from background"));
      if (!res.ok) return reject(new Error(res.error || "request failed"));
      resolve(res.result);
    });
  });
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v);
    } else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function clear() {
  app.textContent = "";
}

function showError(message) {
  clear();
  app.appendChild(el("p", { class: "error", text: message }));
  app.appendChild(el("button", { class: "btn", text: "Retry", onclick: load }));
}

function presetRow(preset, score) {
  const meta = [`${preset.filters.length} filter${preset.filters.length === 1 ? "" : "s"}`];
  if (preset.search) meta.push(`\u201c${preset.search}\u201d`);
  if (typeof score === "number") meta.push(`${Math.round(score * 100)}% match`);

  const actions = el("div", { class: "row-actions" }, [
    el("button", {
      class: "btn primary",
      text: "Apply",
      onclick: async () => {
        try {
          await send({ type: "apply", id: preset.id });
          window.close();
        } catch (e) {
          showError(e.message);
        }
      },
    }),
    el("button", {
      class: "btn icon",
      title: "Rename",
      text: "\u270e",
      onclick: async () => {
        const name = window.prompt("Rename preset", preset.name);
        if (!name || name === preset.name) return;
        try {
          await send({ type: "rename", id: preset.id, name });
          load();
        } catch (e) {
          showError(e.message);
        }
      },
    }),
    el("button", {
      class: "btn icon danger",
      title: "Delete",
      text: "\u2715",
      onclick: async () => {
        if (!window.confirm(`Delete \u201c${preset.name}\u201d?`)) return;
        try {
          await send({ type: "delete", id: preset.id });
          load();
        } catch (e) {
          showError(e.message);
        }
      },
    }),
  ]);

  return el("li", { class: "preset" }, [
    el("div", { class: "preset-info" }, [
      el("div", { class: "preset-name", text: preset.name }),
      el("div", { class: "preset-meta", text: meta.join(" \u00b7 ") }),
    ]),
    actions,
  ]);
}

function renderSaveSection(context) {
  const count = context.filters ? context.filters.length : 0;
  const section = el("section", { class: "save" });

  if (count === 0) {
    section.appendChild(
      el("p", {
        class: "muted",
        text: "No filters selected on this page. Apply some filters first, then save.",
      })
    );
    return section;
  }

  const input = el("input", {
    type: "text",
    class: "name-input",
    placeholder: "Preset name",
    value: context.search || "",
  });
  const btn = el("button", {
    class: "btn primary",
    text: `Save ${count} filter${count === 1 ? "" : "s"}`,
  });
  btn.addEventListener("click", async () => {
    const name = input.value.trim() || context.search;
    if (!name) {
      input.focus();
      return;
    }
    btn.disabled = true;
    try {
      await send({ type: "save", name });
      load();
    } catch (e) {
      showError(e.message);
    }
  });

  section.appendChild(el("div", { class: "save-row" }, [input, btn]));
  return section;
}

function render({ context, matched, others }) {
  clear();

  if (!context.supported) {
    app.appendChild(
      el("p", {
        class: "muted",
        text: "Open a supported shopping site (Flipkart, Amazon, Myntra, Ajio) and run a search to use FilterCart.",
      })
    );
    return;
  }

  app.appendChild(
    el("div", { class: "context" }, [
      el("span", { class: "badge", text: context.label || context.siteId }),
      el("span", {
        class: "search",
        text: context.search ? `\u201c${context.search}\u201d` : "(no search term)",
      }),
    ])
  );

  app.appendChild(renderSaveSection(context));

  if (matched && matched.length) {
    app.appendChild(el("h2", { class: "section-title", text: "Matching presets" }));
    app.appendChild(
      el(
        "ul",
        { class: "preset-list" },
        matched.map((m) => presetRow(m.preset, m.score))
      )
    );
  }

  if (others && others.length) {
    app.appendChild(el("h2", { class: "section-title", text: "Other presets on this site" }));
    app.appendChild(
      el(
        "ul",
        { class: "preset-list" },
        others.map((p) => presetRow(p))
      )
    );
  }

  if ((!matched || !matched.length) && (!others || !others.length)) {
    app.appendChild(el("p", { class: "muted", text: "No saved presets yet for this site." }));
  }
}

async function load() {
  clear();
  app.appendChild(el("p", { class: "muted", text: "Loading\u2026" }));
  try {
    const data = await send({ type: "list" });
    render(data);
  } catch (e) {
    showError(e.message);
  }
}

load();
