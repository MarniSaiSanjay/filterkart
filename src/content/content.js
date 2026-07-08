// FilterCart content script.
// Injects a small, style-isolated floating button on supported result pages
// that gives quick access to Save (current filters) and Apply (matching preset)
// without opening the toolbar popup. All logic is delegated to the background
// message router via chrome.runtime.sendMessage, so this stays UI-only.

(function () {
  if (window.__filterCartInjected) return;
  window.__filterCartInjected = true;

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

  const host = document.createElement("div");
  host.id = "filtercart-root";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .fab {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .toggle {
      background: #2874f1; color: #fff; border: none; border-radius: 20px;
      padding: 10px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .toggle:hover { background: #1c5fd0; }
    .panel {
      position: absolute; right: 0; bottom: 48px; width: 260px;
      background: #fff; color: #1a1a1a; border: 1px solid #e5e7eb;
      border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18);
      padding: 12px; display: none;
    }
    .panel.open { display: block; }
    .title { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: #2874f1; }
    .muted { font-size: 12px; color: #6b7280; line-height: 1.4; }
    .row { display: flex; gap: 6px; margin-bottom: 8px; }
    input {
      flex: 1; min-width: 0; padding: 6px 8px; font-size: 12px;
      border: 1px solid #e5e7eb; border-radius: 6px;
    }
    button.act {
      font-size: 12px; padding: 6px 10px; border-radius: 6px; cursor: pointer;
      border: 1px solid #2874f1; background: #2874f1; color: #fff;
    }
    button.act.ghost { background: #fff; color: #1a1a1a; border-color: #e5e7eb; }
    ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 180px; overflow: auto; }
    li {
      display: flex; align-items: center; justify-content: space-between;
      gap: 6px; padding: 6px 0; border-top: 1px solid #f0f0f0; font-size: 12px;
    }
    .pname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `;
  root.appendChild(style);

  const fab = document.createElement("div");
  fab.className = "fab";
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = "FilterCart";
  const panel = document.createElement("div");
  panel.className = "panel";
  fab.appendChild(panel);
  fab.appendChild(toggle);
  root.appendChild(fab);

  async function refresh() {
    panel.textContent = "";
    const heading = document.createElement("p");
    heading.className = "title";
    heading.textContent = "FilterCart";
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
    if (count > 0) {
      const row = document.createElement("div");
      row.className = "row";
      const input = document.createElement("input");
      input.placeholder = "Preset name";
      input.value = context.search || "";
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
          save.textContent = "Error";
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

  document.documentElement.appendChild(host);
})();
