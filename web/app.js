"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const sectionNav = byId("sections");
  const entryNav = byId("entries");
  const reader = byId("reader");
  const search = byId("search");
  const groupSelect = byId("group");
  const browser = byId("browse");
  const browseToggle = byId("browse-toggle");
  const sections = globalThis.DND_CATALOG;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  const fieldLabels = {
    desc: "Description", lvl: "Level", minitrait_list: "Trait options",
    attribute_bonuses: "Ability bonuses", casting: "Casting time"
  };
  function label(key) {
    if (Object.hasOwn(fieldLabels, key)) return fieldLabels[key];
    const words = String(key).replace(/_/g, " ").replace(/^lvl\s+/i, "Level ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  function title(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function plain(value) {
    return value === null || typeof value !== "object";
  }

  // Only the emphasis and line-break markers used by the source are formatted.
  // All other markup and all attribute values stay plain text.
  function inline(text) {
    const fragment = document.createDocumentFragment();
    const parents = [fragment];
    const tokens = text.split(/(<\/?(?:i|b|em|strong)>|<br\s*\/?>)/gi);
    for (const token of tokens) {
      if (!token) continue;
      if (/^<br\s*\/?>$/i.test(token)) {
        parents.at(-1).append(element("br"));
      } else if (/^<(?:i|b|em|strong)>$/i.test(token)) {
        const emphasis = element(token.slice(1, -1).toLowerCase());
        parents.at(-1).append(emphasis);
        parents.push(emphasis);
      } else if (/^<\/(?:i|b|em|strong)>$/i.test(token)) {
        if (parents.length > 1 && parents.at(-1).localName === token.slice(2, -1).toLowerCase()) {
          parents.pop();
        }
      } else {
        parents.at(-1).append(document.createTextNode(token));
      }
    }
    return fragment;
  }

  function prose(value) {
    const fragment = document.createDocumentFragment();
    const text = value == null ? "—" : String(value).trim();
    const segments = text.replace(/\|(?=<i>|<b>|<em>|<strong>)/gi, "\n\n").split(/\n\s*\n/);
    for (const segment of segments) {
      let paragraphLines = [];
      let list = null;
      function finishParagraph() {
        if (!paragraphLines.length) return;
        const p = element("p", "rule-paragraph");
        p.append(inline(paragraphLines.join("\n")));
        fragment.append(p);
        paragraphLines = [];
      }
      for (const line of segment.split("\n")) {
        const bullet = line.match(/^\s*[*•]\s+(.+)/);
        if (bullet) {
          finishParagraph();
          if (!list) {
            list = element("ul", "rule-list");
            fragment.append(list);
          }
          const li = element("li");
          li.append(inline(bullet[1]));
          list.append(li);
        } else {
          list = null;
          paragraphLines.push(line);
        }
      }
      finishParagraph();
    }
    return fragment;
  }

  function heading(text, depth) {
    return element("h" + Math.min(depth, 6), "", text);
  }
  function field(key, value, depth) {
    const block = element("section", "field");
    const name = label(key);
    const h = heading(name, depth);
    if (/^Level \d+$/i.test(name)) h.classList.add("level-title");
    block.append(h, renderValue(value, depth + 1));
    return block;
  }
  function renderValue(value, depth) {
    if (plain(value)) return prose(value);
    if (Array.isArray(value)) {
      if (!value.length) return prose("—");
      if (value.every(plain)) {
        const list = element("ul", "rule-list");
        for (const item of value) {
          const li = element("li");
          li.append(prose(item));
          list.append(li);
        }
        return list;
      }
      const records = element("div", "records");
      for (const item of value) {
        const record = element("div", "record");
        record.append(renderValue(item, depth));
        records.append(record);
      }
      return records;
    }
    const fragment = document.createDocumentFragment();
    if (typeof value.name === "string") {
      const h = heading(title(value.name), depth);
      h.className = "trait-title";
      fragment.append(h);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "name" && typeof child === "string") continue;
      if (/^(desc|description)$/i.test(key) && plain(child)) {
        fragment.append(prose(child));
      } else {
        fragment.append(field(key, child, depth));
      }
    }
    return fragment;
  }

  const statKeys = new Set(["damage", "type", "types", "size", "speed", "lvl", "level", "casting",
    "range", "duration", "components", "weight", "cost", "attribute_bonuses",
    "status", "source", "current_rules"]);
  function buildDetails(entry, header) {
    const details = entry.details;
    if (!details || plain(details) || Array.isArray(details)) {
      reader.append(renderValue(details, 2));
      return;
    }
    const stats = element("dl", "stats");
    const body = element("div", "entry-body");
    const levels = [];
    for (const [key, value] of Object.entries(details)) {
      if (key === "name" && value === entry.name) continue;
      if (key === "group" && value === entry.group) continue;
      if (key === "sections" && Array.isArray(value) && value.length && value.every(
        (section) => section && typeof section.heading === "string" && Object.hasOwn(section, "body")
          && Object.keys(section).every((name) => name === "heading" || name === "body")
      )) {
        for (const section of value) body.append(field(section.heading, section.body, 2));
        continue;
      }
      const compact = plain(value) || (Array.isArray(value) && value.every(plain));
      if (statKeys.has(key.toLowerCase()) && compact) {
        const pair = element("div");
        const data = Array.isArray(value) ? value.join(", ") : value;
        pair.append(element("dt", "", label(key)), element("dd", "", data ?? "—"));
        stats.append(pair);
      } else {
        const block = field(key, value, 2);
        body.append(block);
        if (/^(?:lvl|level)\s+\d+$/i.test(key)) levels.push([label(key), block.firstChild]);
      }
    }
    if (levels.length > 1) {
      const jump = element("select");
      jump.setAttribute("aria-label", "Jump to level");
      jump.append(new Option("Jump to level…", ""));
      levels.forEach(([name], index) => jump.append(new Option(name, String(index))));
      jump.addEventListener("change", () => {
        if (!jump.value) return;
        const target = levels[Number(jump.value)][1];
        target.tabIndex = -1;
        target.focus();
        target.scrollIntoView({ block: "start" });
        jump.value = "";
      });
      header.append(jump);
    }
    if (stats.childElementCount) reader.append(stats);
    reader.append(body);
  }

  function message(name, description) {
    const h = element("h1", "", name);
    h.id = "entry-title";
    reader.replaceChildren(h, element("p", "state-message", description));
    document.title = name + " · Open D&D";
  }
  if (!Array.isArray(sections) || !sections.length) {
    message("Catalog unavailable", "Open the index.html from the built site to read the compendium.");
    browser.hidden = true;
    return;
  }
  const firstSection = sections.find((s) => s.key === "classes" && s.entries.length)
    || sections.find((s) => s.entries.length) || sections[0];
  const searchText = new Map();
  for (const section of sections) {
    for (const entry of section.entries) {
      searchText.set(entry, (entry.name + " " + entry.group + " " + JSON.stringify(entry.details)).toLowerCase());
    }
  }
  function route(section, entry) {
    const params = new URLSearchParams({ section: section.key });
    if (entry) {
      params.set("entry", entry.name);
      if (entry.group) params.set("group", entry.group);
    }
    return "#" + params.toString();
  }

  let current = null;
  let requested = null;
  function setExpanded(expanded) {
    browser.classList.toggle("expanded", expanded);
    browseToggle.setAttribute("aria-expanded", String(expanded));
    browseToggle.textContent = expanded ? "Hide entries" : "Browse entries";
  }
  browseToggle.addEventListener("click", () => setExpanded(!browser.classList.contains("expanded")));
  byId("skip").addEventListener("click", (event) => {
    event.preventDefault();
    reader.focus();
  });
  byId("search-form").addEventListener("submit", (event) => event.preventDefault());

  function configureSection(section) {
    current = section;
    search.value = "";
    byId("section-name").textContent = section.title;
    search.placeholder = "Search " + section.title.toLowerCase();
    const groups = [...new Set(section.entries.map((entry) => entry.group).filter(Boolean))].sort();
    groupSelect.replaceChildren(new Option("All groups", ""));
    for (const group of groups) groupSelect.append(new Option(title(group), group));
    groupSelect.hidden = groups.length < 2;
    search.disabled = section.entries.length === 0;
    for (const link of sectionNav.children) {
      if (link.dataset.key === section.key) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    setExpanded(false);
  }
  function matches(entry) {
    if (groupSelect.value && entry.group !== groupSelect.value) return false;
    return search.value.toLowerCase().trim().split(/\s+/).every((word) => searchText.get(entry).includes(word));
  }
  function draw() {
    const matchesFilter = current.entries.filter(matches);
    if (current.key === "classes") {
      matchesFilter.sort((left, right) =>
        Number(right.group === "Base class") - Number(left.group === "Base class"));
    }
    const active = matchesFilter.includes(requested) ? requested : matchesFilter[0];
    const names = new Set();
    const duplicates = new Set();
    for (const entry of matchesFilter) {
      if (names.has(entry.name)) duplicates.add(entry.name);
      names.add(entry.name);
    }
    const fragment = document.createDocumentFragment();
    for (const entry of matchesFilter) {
      const link = element("a", "entry-link", title(entry.name));
      link.href = route(current, entry);
      if (entry === active) link.setAttribute("aria-current", "page");
      if (duplicates.has(entry.name)) link.append(element("span", "entry-group", entry.group));
      fragment.append(link);
    }
    entryNav.replaceChildren(fragment);
    const n = matchesFilter.length;
    byId("entry-count").textContent = (n === current.entries.length ? n : n + " of " + current.entries.length)
      + (current.entries.length === 1 ? " entry" : " entries");
    if (!active) {
      if (!current.entries.length) {
        message(current.title, "This section currently has no entries in the repository.");
      } else {
        message("No matching entries", "Try a different search or group in " + current.title + ".");
        const clear = element("button", "clear-filters", "Clear filters");
        clear.type = "button";
        clear.addEventListener("click", () => {
          search.value = "";
          groupSelect.value = "";
          draw();
          if (window.matchMedia("(max-width: 740px)").matches) setExpanded(true);
          search.focus();
        });
        reader.append(clear);
      }
      return;
    }
    const header = element("header", "entry-header");
    const context = [...new Set([current.title, active.group].filter(Boolean).map(title))].join("  /  ");
    const h = element("h1", "", title(active.name));
    h.id = "entry-title";
    header.append(element("p", "entry-context", context), h);
    reader.replaceChildren(header);
    buildDetails(active, header);
    if (active.source) {
      const footer = element("footer", "source-file");
      footer.append("Source file ", element("code", "", "data/" + active.source));
      reader.append(footer);
    }
    document.title = title(active.name) + " · " + current.title + " · Open D&D";
  }

  for (const section of sections) {
    const link = element("a", "section-link", section.title);
    link.href = route(section);
    link.dataset.key = section.key;
    sectionNav.append(link);
  }
  function readRoute() {
    const params = new URLSearchParams(location.hash.slice(1));
    const section = sections.find((s) => s.key === params.get("section")) || firstSection;
    if (section !== current || !params.has("entry")) configureSection(section);
    requested = section.entries.find((entry) => entry.name === params.get("entry")
      && (!params.has("group") || entry.group === params.get("group")));
    if (requested && !matches(requested)) {
      groupSelect.value = "";
      search.value = "";
    }
    draw();
  }
  search.addEventListener("input", draw);
  groupSelect.addEventListener("change", draw);
  entryNav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.button || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    setExpanded(false);
    reader.focus({ preventScroll: true });
    reader.scrollIntoView({ block: "start" });
  });
  window.addEventListener("hashchange", readRoute);
  readRoute();
})();
