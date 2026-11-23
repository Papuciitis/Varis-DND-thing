"use strict";

// YAML is compiled at build time; the browser only requests the section it needs.
(() => {
  let embedded = Array.isArray(globalThis.DND_CATALOG);
  const sections = embedded ? globalThis.DND_CATALOG : [];
  const pending = new Map();
  const loaded = new Set(embedded ? sections.map(section => section.key) : []);
  let manifest;
  let builder;
  async function request(url) {
    if (globalThis.location?.protocol === "file:") {
      throw new Error("Open the portable copy in the offline folder, or use the published website.");
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load rules (${response.status}). Please retry.`);
    return response.json();
  }
  const api = {
    version: globalThis.DND_RULES_VERSION || "",
    ready: null,
    async loadSection(key) {
      await api.ready;
      const section = sections.find(item => item.key === key);
      if (!section) throw new Error(`Unknown section: ${key}`);
      if (loaded.has(key)) return section;
      if (!pending.has(key)) {
        pending.set(key, request(section.url).then(data => {
          if (data.key !== key || !Array.isArray(data.entries) || data.entries.length !== section.count) {
            throw new Error(`Invalid rules data for ${section.title}. Please retry.`);
          }
          section.entries.splice(0, section.entries.length, ...data.entries);
          loaded.add(key);
          return section;
        }).finally(() => pending.delete(key)));
      }
      return pending.get(key);
    },
    async loadAll() {
      await api.ready;
      await Promise.all(sections.map(section => api.loadSection(section.key)));
      return sections;
    },
    async loadBuilder() {
      await api.ready;
      if (embedded) return globalThis.DND_CHARACTER_RULES || {};
      if (!builder) builder = request(manifest.builder).catch(error => { builder = null; throw error; });
      return builder;
    },
    isLoaded(key) { return loaded.has(key); }
  };
  // Script tags work on file URLs. Keep the original page URL (and its saves)
  // while loading the portable catalog only for direct-from-disk use.
  function loadPortable() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "data/portable-catalog.js";
      script.onload = () => {
        if (!Array.isArray(globalThis.DND_CATALOG)) return reject(new Error("Invalid portable rules data."));
        embedded = true;
        sections.push(...globalThis.DND_CATALOG);
        globalThis.DND_CATALOG = sections;
        for (const section of sections) loaded.add(section.key);
        api.version = globalThis.DND_RULES_VERSION || "";
        resolve(sections);
      };
      script.onerror = () => reject(new Error("Portable rules could not load. Rebuild the site or open the copy in the offline folder."));
      document.head.append(script);
    });
  }
  api.ready = embedded ? Promise.resolve(sections) : globalThis.location?.protocol === "file:" ? loadPortable() : request("data/catalog-manifest.json").then(data => {
    if (!Array.isArray(data.sections) || !data.version || !data.builder) throw new Error("Invalid rules manifest.");
    manifest = data;
    for (const section of data.sections) sections.push({...section, entries:[]});
    api.version = data.version;
    globalThis.DND_RULES_VERSION = data.version;
    globalThis.DND_CATALOG = sections;
    return sections;
  });
  // Startup consumers show the error with a retry/portable link; avoid an unhandled rejection meanwhile.
  api.ready.catch(() => {});
  globalThis.DndCatalog = api;
})();
