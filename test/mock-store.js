// In-memory stand-in for chrome.storage.sync (callback style) used by tests.
export function mockStore(initial = {}) {
  let data = { ...initial };
  return {
    get(key, cb) {
      const out = {};
      if (typeof key === "string") {
        if (key in data) out[key] = data[key];
      } else if (Array.isArray(key)) {
        for (const k of key) if (k in data) out[k] = data[k];
      } else {
        Object.assign(out, data);
      }
      cb(out);
    },
    set(obj, cb) {
      data = { ...data, ...obj };
      cb();
    },
  };
}
