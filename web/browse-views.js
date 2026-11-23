"use strict";

// Alternative reader layouts. Routes and rule rendering stay with the reader.
(() => {
  const collate = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const normalize = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const cap = value => String(value || "").replace(/^./, char => char.toUpperCase());
  const compare = (a, b, mode) => globalThis.EntryOrder?.compare(a, b, mode)
    ?? collate.compare(a.name || "", b.name || "");

  function classDirectory(section, {el, link, entryRoute}) {
    const list = el("ul", "class-directory");
    const classes = section.entries.filter(entry => normalize(entry.group) === "base class")
      .sort((a, b) => compare(a, b, "name"));
    for (const entry of classes) {
      const item = el("li", "class-card");
      item.append(link(cap(entry.name), entryRoute(section, entry), "result-name class-name"));
      const family = normalize(entry.name + " archetype");
      const children = section.entries.filter(child => normalize(child.group).replace(/s$/, "") === family)
        .sort((a, b) => compare(a, b, "level-asc"));
      if (children.length) {
        const disclosure = el("details", "class-disclosure");
        const summary = el("summary", "", children.length + (children.length === 1 ? " archetype" : " archetypes"));
        summary.setAttribute("aria-label", cap(entry.name) + " archetypes, " + children.length);
        const archetypes = el("ul", "archetype-list");
        for (const child of children) {
          const row = el("li");
          row.append(link(cap(child.name), entryRoute(section, child), "archetype-link"));
          const level = globalThis.EntryOrder?.level(child);
          if (level != null) row.append(el("span", "result-meta", "Level " + level));
          archetypes.append(row);
        }
        disclosure.append(summary, archetypes);
        item.append(disclosure);
      } else item.append(el("span", "result-meta", "No archetypes in this catalog"));
      list.append(item);
    }
    return list;
  }

  function expandableList(rows, {el, link, entryRoute, renderDetails}) {
    const list = el("div", "comparison-list");
    for (const {section, entry} of rows) {
      const item = el("details", "comparison-entry");
      const summary = el("summary", "comparison-heading");
      summary.append(el("span", "result-name", cap(entry.name)));
      if (entry.group) summary.append(el("span", "result-meta", cap(entry.group)));
      const body = el("div", "comparison-body");
      const open = link("Open entry", entryRoute(section, entry), "text-link comparison-open");
      open.setAttribute("aria-label", "Open " + entry.name + " entry");
      body.append(open);
      renderDetails(entry, body);
      item.append(summary, body);
      list.append(item);
    }
    return list;
  }

  globalThis.BrowseViews = Object.freeze({classDirectory, expandableList});
})();
