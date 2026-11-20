"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const reader = byId("reader");
  const trail = byId("trail");
  const search = byId("search");
  const picker = byId("section-picker");
  const sections = globalThis.DND_CATALOG || [];
  const sectionByKey = new Map(sections.map(s => [s.key, s]));
  const perPage = 24;
  const collate = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const families = [
    ["Characters", ["classes", "races", "backgrounds", "feats"]],
    ["Magic & equipment", ["spells", "items", "weapon-rules"]],
    ["At the table", ["rules", "conditions", "design-notes"]]
  ];
  const assigned = new Set(families.flatMap(([, keys]) => keys));
  const other = sections.filter(s => !assigned.has(s.key));
  if (other.length) families.push(["More sections", other.map(s => s.key)]);

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }
  const cap = text => String(text).charAt(0).toUpperCase() + String(text).slice(1);
  const countText = n => n.toLocaleString("en") + (n === 1 ? " entry" : " entries");
  const plain = value => value === null || typeof value !== "object";
  const fragment = () => document.createDocumentFragment();
  const fieldLabels = {
    desc: "Description", lvl: "Level", minitrait_list: "Trait options", attribute_bonuses: "Ability bonuses",
    casting: "Casting time", higher_levels: "At higher levels"
  };
  function label(key) {
    return Object.hasOwn(fieldLabels, key) ? fieldLabels[key] : cap(String(key).replace(/_/g, " ").replace(/^lvl\s+/i, "Level "));
  }
  function link(text, params, className) {
    const a = el("a", className, text);
    a.href = href(params);
    return a;
  }
  function href(params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== "" && value != null) query.set(key, value);
    }
    return "#" + query.toString();
  }
  const entryRoute = (section, entry) => ({section: section.key, entry: entry.name, group: entry.group});
  const norm = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'").trim();
  function spellLevel(entry) {
    const value = String(entry.details?.lvl ?? entry.details?.level ?? "").trim();
    return value || (/\bcantrips?\b/i.test(entry.group) ? "0" : "");
  }
  const levelLabel = value => "Level " + value;
  const all = sections.flatMap(section => section.entries.map(entry => {
    const name = norm(entry.name);
    const lead = norm([entry.name, entry.group, section.title].join(" "));
    const body = norm(JSON.stringify(entry.details) ?? "").replace(/\\n/g, " ");
    return {section, entry, name, lead, text: lead + " " + body};
  }));
  const dataBySection = new Map(sections.map(s => [s.key, all.filter(item => item.section === s)]));
  function browseGroup(section, name) {
    return section.key === "classes" ? name.replace(/ archetype$/i, " archetypes") : name;
  }
  const groupsBySection = new Map();
  for (const section of sections) {
    const groups = new Map();
    for (const entry of section.entries) {
      const group = browseGroup(section, entry.group);
      groups.set(group, (groups.get(group) || 0) + 1);
    }
    groupsBySection.set(section.key, [...groups].sort(([a], [b]) =>
      Number(b === "Base class") - Number(a === "Base class") || collate.compare(a, b)));
  }
  function matching(items, query) {
    const q = norm(query);
    const words = q.split(/\s+/).filter(Boolean);
    const rank = row => row.name === q ? 0 : row.name.startsWith(q) ? 1 : row.name.includes(q) ? 2 :
      words.every(w => row.lead.includes(w)) ? 3 : 4;
    return items.filter(row => words.every(w => row.text.includes(w))).sort((a, b) =>
      (q ? rank(a) - rank(b) : 0) || collate.compare(a.entry.name, b.entry.name) ||
      collate.compare(a.entry.group, b.entry.group) || collate.compare(a.section.title, b.section.title));
  }
  function heading(name) {
    const h = el("h1", "", name);
    h.id = "entry-title";
    document.title = name + " · Open D&D";
    return h;
  }
  function crumbs(parts) {
    trail.replaceChildren();
    trail.hidden = !parts.length;
    if (!parts.length) return;
    const list = el("ol");
    for (const [name, params] of [["Compendium", {}], ...parts]) {
      const item = el("li");
      const child = params ? link(name, params) : el("span", "", name);
      if (!params) child.setAttribute("aria-current", "page");
      item.append(child);
      list.append(item);
    }
    trail.append(list);
  }
  function panelLink(name, n, params) {
    const a = link("", params, "panel-link");
    a.append(el("span", "panel-name", name), el("span", "panel-count", countText(n)));
    return a;
  }
  function home() {
    crumbs([]);
    const header = el("header", "index-heading");
    header.append(heading("Rules compendium"));
    const grid = el("div", "shelves");
    for (const [family, keys] of families) {
      const members = keys.map(k => sectionByKey.get(k)).filter(Boolean);
      if (!members.length) continue;
      const shelf = el("section", "shelf");
      shelf.append(el("h2", "", family));
      for (const s of members) shelf.append(panelLink(s.title, s.entries.length, {section: s.key}));
      grid.append(shelf);
    }
    reader.append(header, grid);
  }
  function labelledSelect(text, id) {
    const wrapper = el("label", "select-field");
    wrapper.append(el("span", "", text));
    const select = el("select");
    select.id = id;
    wrapper.append(select);
    return [wrapper, select];
  }
  function resultList(rows, params) {
    const wrap = el("div", "result-set");
    const nPages = Math.max(1, Math.ceil(rows.length / perPage));
    const page = Math.max(1, Math.min(nPages, parseInt(params.page, 10) || 1));
    const first = (page - 1) * perPage;
    const count = rows.length > perPage
      ? (first + 1).toLocaleString("en") + "–" + Math.min(first + perPage, rows.length).toLocaleString("en") + " of " + countText(rows.length)
      : countText(rows.length);
    byId("announcement").textContent = count;
    wrap.append(el("p", "result-count", count));
    if (!rows.length) {
      wrap.append(el("h2", "empty-title", "No matching entries"));
      const reset = params.q ? {} : {section: params.section};
      wrap.append(link("Clear filters", reset, "text-link"));
      return wrap;
    }
    const list = el("ul", "results");
    for (const {section, entry} of rows.slice(first, first + perPage)) {
      const li = el("li");
      const a = link("", entryRoute(section, entry), "result");
      a.append(el("span", "result-name", cap(entry.name)));
      const info = [!params.section ? section.title : "", params.group === entry.group ? "" : entry.group];
      const level = section.key === "spells" ? spellLevel(entry) : "";
      if (level && !info.some(s => /cantrip/i.test(s) && level === "0")) info.push(levelLabel(level));
      a.append(el("span", "result-meta", info.filter(Boolean).map(cap).join(" · ")));
      li.append(a);
      list.append(li);
    }
    wrap.append(list);
    if (nPages > 1) {
      const nav = el("nav", "pagination");
      nav.setAttribute("aria-label", "Result pages");
      if (page > 1) nav.append(link("← Previous", {...params, page: page - 1}, "button-link"));
      nav.append(el("span", "", "Page " + page + " of " + nPages));
      if (page < nPages) nav.append(link("Next →", {...params, page: page + 1}, "button-link"));
      wrap.append(nav);
    }
    return wrap;
  }
  function openFilters(params, replace = false) {
    const next = href(params);
    if (location.hash === next) return;
    if (replace) {
      history.replaceState(null, "", next);
      draw();
    } else {
      location.hash = next;
    }
  }
  function directory(section, params) {
    const base = {section: section.key};
    const groups = groupsBySection.get(section.key);
    const group = browseGroup(section, params.group || "");
    const level = params.level || "";
    const filter = params.filter || "";
    const grouped = groups.filter(([name]) => name);
    const groupedView = grouped.length > 1 && !group && !level && !filter && !params.browse;
    const parts = [[section.title, group ? base : null]];
    if (group) parts.push([cap(group), null]);
    crumbs(parts);
    const head = el("header", "index-heading");
    head.append(heading(group ? cap(group) : section.title));
    reader.append(head);
    const form = el("form", "filters");
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "Filter " + section.title);
    const box = el("label", "local-search");
    box.append(el("span", "", "Find in " + section.title.toLowerCase()));
    const input = el("input");
    input.type = "search";
    input.id = "section-search";
    input.placeholder = "Name or rule text";
    input.value = filter;
    box.append(input);
    form.append(box);
    function setFilter(value, typed) {
      openFilters({...params, filter: value, page: "", browse: value ? "all" : params.browse}, typed);
    }
    input.addEventListener("input", () => setFilter(input.value, true));
    form.addEventListener("submit", event => {
      event.preventDefault();
      setFilter(input.value, true);
    });
    if (grouped.length > 1) {
      const [field, select] = labelledSelect("Group", "group");
      select.append(new Option("All groups", ""));
      for (const [title] of grouped) select.append(new Option(cap(title), title));
      select.value = group;
      select.addEventListener("change", () => openFilters({...params, group: select.value, browse: "all", page: ""}));
      form.append(field);
    }
    if (section.key === "spells") {
      const levels = [...new Set(section.entries.map(spellLevel).filter(Boolean))].sort(collate.compare);
      if (levels.length) {
        const [field, select] = labelledSelect("Spell level", "spell-level");
        select.append(new Option("All levels", ""));
        for (const l of levels) select.append(new Option(levelLabel(l), l));
        select.value = level;
        select.addEventListener("change", () => openFilters({...params, level: select.value, browse: "all", page: ""}));
        form.append(field);
      }
    }
    reader.append(form);
    if (!section.entries.length) {
      reader.append(el("p", "state-message", "This section has no entries yet."));
      return;
    }
    if (groupedView) {
      const groupsHead = el("div", "subhead");
      groupsHead.append(el("h2", "", "Browse by group"), link("Browse all " + countText(section.entries.length) + " →", {...base, browse: "all"}, "text-link"));
      reader.append(groupsHead);
      const grid = el("div", "groups");
      for (const [title, n] of grouped) grid.append(panelLink(cap(title), n, {...base, group: title}));
      reader.append(grid);
      const ungrouped = dataBySection.get(section.key).filter(row => !row.entry.group);
      if (ungrouped.length) {
        reader.append(el("h2", "general-heading", "General entries"), resultList(matching(ungrouped, ""), {...base, page: params.page}));
      }
    } else {
      const rows = dataBySection.get(section.key).filter(({entry}) =>
        (!group || browseGroup(section, entry.group) === group) && (!level || spellLevel(entry) === level));
      reader.append(resultList(matching(rows, filter), params));
    }
  }
  function globalResults(params) {
    crumbs([["Search", null]]);
    const head = el("header", "index-heading");
    head.append(heading("Search results"));
    reader.append(head);
    const [field, select] = labelledSelect("Search within", "search-scope");
    select.append(new Option("All sections", ""));
    for (const s of sections) select.append(new Option(s.title, s.key));
    select.value = params.scope || "";
    select.addEventListener("change", () => openFilters({...params, scope: select.value, page: ""}));
    const toolbar = el("div", "filters search-scope");
    toolbar.append(field);
    reader.append(toolbar, resultList(matching(dataBySection.get(params.scope) || all, params.q), params));
  }

  function inline(text) {
    const result = fragment();
    const parents = [result];
    for (const part of String(text).split(/(<\/?(?:i|b|em|strong)>|<br\s*\/?>)/gi)) {
      if (!part) continue;
      if (/^<br\s*\/?>$/i.test(part)) parents.at(-1).append(el("br"));
      else if (/^<(?:i|b|em|strong)>$/i.test(part)) {
        const marker = el(part.slice(1, -1).toLowerCase());
        parents.at(-1).append(marker);
        parents.push(marker);
      } else if (/^<\/(?:i|b|em|strong)>$/i.test(part)) {
        if (parents.at(-1).localName === part.slice(2, -1).toLowerCase()) parents.pop();
      } else parents.at(-1).append(document.createTextNode(part));
    }
    return result;
  }
  function prose(value) {
    const result = fragment();
    const text = String(value ?? "—").trim().replace(/\|(?=<(?:i|b|em|strong)>)/gi, "\n\n");
    for (const para of text.split(/\n\s*\n/)) {
      const levels = [];
      let lines = [];
      function flush() {
        if (!lines.length) return;
        const p = el("p", "rule-paragraph");
        p.append(inline(lines.join("\n")));
        result.append(p);
        lines = [];
      }
      for (const line of para.split("\n")) {
        const bullet = line.match(/^(\s*)[*•]\s+(.+)/);
        if (bullet) {
          flush();
          const indent = bullet[1].replace(/\t/g, "    ").length;
          while (levels.length && levels.at(-1).indent > indent) levels.pop();
          if (!levels.length || levels.at(-1).indent < indent) {
            const list = el("ul", "rule-list");
            (levels.at(-1)?.last || result).append(list);
            levels.push({indent, list});
          }
          const li = el("li");
          li.append(inline(bullet[2]));
          levels.at(-1).list.append(li);
          levels.at(-1).last = li;
        } else if (levels.length && /^\s+\S/.test(line)) {
          levels.at(-1).last.append(el("br"), inline(line.trimStart()));
        } else {
          levels.length = 0;
          lines.push(line);
        }
      }
      flush();
    }
    return result;
  }
  const isTable = v => v && Array.isArray(v.columns) && Array.isArray(v.rows) && v.rows.every(Array.isArray);
  function table(data, depth, title) {
    const wrap = el("div", "table-scroll");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", title || "Rules table");
    const grid = el("table");
    if (data.caption) grid.append(el("caption", "", data.caption));
    const head = el("thead");
    const headings = el("tr");
    for (const col of data.columns) {
      const cell = el("th");
      cell.scope = "col";
      cell.append(inline(col));
      headings.append(cell);
    }
    head.append(headings);
    const body = el("tbody");
    for (const row of data.rows) {
      const tr = el("tr");
      for (const value of row) {
        const td = el("td");
        td.append(renderValue(value, depth + 1));
        tr.append(td);
      }
      body.append(tr);
    }
    grid.append(head, body);
    wrap.append(grid);
    return wrap;
  }
  function isSections(value) {
    return Array.isArray(value) && value.length && value.every(x => x && typeof x.heading === "string" &&
      Object.hasOwn(x, "body") && Object.keys(x).every(k => ["heading", "body"].includes(k)));
  }
  function textField(key, value, depth) {
    const block = el("section", "field");
    block.append(el("h" + Math.min(6, depth), "", label(key)), renderValue(value, depth + 1, label(key)));
    return block;
  }
  function renderValue(value, depth, title = "") {
    if (plain(value)) return prose(value);
    if (isTable(value)) return table(value, depth, title);
    if (isSections(value)) {
      const output = fragment();
      for (const s of value) output.append(textField(s.heading, s.body, depth));
      return output;
    }
    if (Array.isArray(value)) {
      const output = el(value.every(plain) ? "ul" : "div", value.every(plain) ? "rule-list" : "records");
      for (const item of value) {
        const child = el(output.localName === "ul" ? "li" : "div", output.localName === "ul" ? "" : "record");
        child.append(renderValue(item, depth, title));
        output.append(child);
      }
      return output;
    }
    const output = fragment();
    if (typeof value.name === "string") output.append(el("h" + Math.min(depth, 6), "trait-name", cap(value.name)));
    for (const [key, item] of Object.entries(value)) {
      if (key === "name" && typeof item === "string") continue;
      if (/^(?:desc|description)$/i.test(key) && plain(item)) output.append(prose(item));
      else if (key === "sections" && isSections(item)) output.append(renderValue(item, depth));
      else output.append(textField(key, item, depth));
    }
    return output;
  }
  const statKeys = new Set(["damage", "type", "types", "size", "speed", "lvl", "level", "casting", "casting_time",
    "range", "duration", "components", "cooldown", "target", "weight", "cost", "attribute_bonuses", "tradition", "school", "status",
    "prerequisite", "prerequisites", "requirements", "save", "base ac", "ac bonus", "current_rules"]);
  function details(entry) {
    const value = entry.details;
    if (plain(value) || Array.isArray(value) || isTable(value)) {
      reader.append(renderValue(value, 2, entry.name));
      return;
    }
    const stats = el("dl", "stats");
    const intro = fragment();
    const chapters = [];
    for (const [key, item] of Object.entries(value)) {
      if ((key === "name" && item === entry.name) || (key === "group" && item === entry.group)) continue;
      if (key === "sections" && isSections(item)) { chapters.push(...item); continue; }
      if (key === "draft_note" && plain(item)) {
        const note = el("aside", "draft-note");
        note.append(el("strong", "", "Draft note"), prose(item));
        intro.append(note);
        continue;
      }
      if (/^(?:desc|description)$/i.test(key) && plain(item)) { intro.append(prose(item)); continue; }
      if (statKeys.has(key.toLowerCase()) && (plain(item) || Array.isArray(item) && item.every(plain))) {
        const stat = el("div");
        const val = el("dd");
        val.append(inline(Array.isArray(item) ? item.join(", ") : item ?? "—"));
        stat.append(el("dt", "", label(key)), val);
        stats.append(stat);
      } else chapters.push({heading: label(key), body: item});
    }
    if (stats.childElementCount) reader.append(stats);
    reader.append(intro);
    const long = chapters.length > 4 || (chapters.length > 1 && JSON.stringify(chapters).length > 4200);
    if (!long) {
      for (const item of chapters) reader.append(textField(item.heading, item.body, 2));
      return;
    }
    const [jumpField, jump] = labelledSelect("Jump to a feature", "chapter-picker");
    jump.append(new Option("Choose a section", ""));
    jumpField.classList.add("chapter-jump");
    reader.append(jumpField);
    const blocks = chapters.map(({heading: title, body}, index) => {
      const block = el("details", "chapter");
      const summary = el("summary", "", title);
      block.append(summary, renderValue(body, 3, title));
      block.open = index === 0;
      jump.append(new Option(title, String(index)));
      reader.append(block);
      return block;
    });
    jump.addEventListener("change", () => {
      if (!jump.value) return;
      const target = blocks[Number(jump.value)];
      target.open = true;
      target.firstElementChild.focus({preventScroll: true});
      target.scrollIntoView({block: "start"});
      jump.value = "";
    });
  }
  const classSupplements = new Map([
    ["Occultist", "Occultist ritual options"],
    ["Spellblade", "Spellblade art and exploit options"]
  ]);
  function classLinks(section, entry) {
    const nav = el("nav", "related");
    nav.setAttribute("aria-label", "Related class entries");
    if (entry.group === "Base class") {
      const groupName = entry.name + " archetypes";
      const group = groupsBySection.get(section.key).find(([name]) => norm(name) === norm(groupName));
      if (group) nav.append(link("Browse " + groupName, {section: section.key, group: group[0]}, "related-link"));
    } else {
      const parent = section.entries.find(e => e.group === "Base class" &&
        norm(browseGroup(section, entry.group)) === norm(e.name + " archetypes"));
      if (parent) nav.append(link("Base class · " + cap(parent.name), entryRoute(section, parent), "related-link"));
    }
    for (const [owner, supplement] of classSupplements) {
      const target = entry.name === owner ? supplement : entry.name === supplement ? owner : null;
      if (!target) continue;
      const other = section.entries.find(e => e.name === target);
      if (other) nav.append(link(cap(other.name), entryRoute(section, other), "related-link"));
    }
    return nav;
  }
  function showEntry(section, entry) {
    const base = {section: section.key};
    const parts = [[section.title, base]];
    if (entry.group) parts.push([cap(entry.group), {...base, group: entry.group}]);
    parts.push([cap(entry.name), null]);
    crumbs(parts);
    const header = el("header", "entry-heading");
    header.append(heading(cap(entry.name)));
    if (section.key === "classes") {
      const links = classLinks(section, entry);
      if (links.childElementCount) header.append(links);
    }
    reader.append(header);
    details(entry);
    const footer = el("footer", "entry-footer");
    if (entry.source) {
      const source = el("p", "source-file", "Source file ");
      source.append(el("code", "", "data/" + entry.source));
      footer.append(source);
    }
    if (footer.childElementCount) reader.append(footer);
  }
  function draw() {
    const oldInput = document.activeElement?.id;
    const selection = oldInput === "section-search" ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const params = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
    const section = sectionByKey.get(params.section);
    reader.replaceChildren();
    reader.className = "";
    byId("announcement").textContent = "";
    picker.value = section?.key || "";
    if (search.value.trim() !== (params.q || "")) search.value = params.q || "";
    if (params.q) {
      globalResults(params);
    } else if (section && params.entry) {
      const entry = section.entries.find(e => e.name === params.entry && (!params.group || e.group === params.group));
      if (entry) {
        reader.className = "article";
        showEntry(section, entry);
      } else {
        crumbs([[section.title, {section: section.key}], ["Entry unavailable", null]]);
        reader.append(heading("Entry unavailable"), link("Browse " + section.title, {section: section.key}, "text-link"));
      }
    } else if (section) directory(section, params);
    else if (params.section) {
      crumbs([["Section unavailable", null]]);
      reader.append(heading("Section unavailable"), link("Open the compendium index", {}, "text-link"));
    } else home();
    if (selection && byId(oldInput)) {
      byId(oldInput).focus({preventScroll: true});
      byId(oldInput).setSelectionRange(...selection);
    }
  }
  for (const [family, keys] of families) {
    const group = el("optgroup");
    group.label = family;
    for (const key of keys) {
      const section = sectionByKey.get(key);
      if (section) group.append(new Option(section.title, section.key));
    }
    if (group.childElementCount) picker.append(group);
  }
  picker.addEventListener("change", () => openFilters({section: picker.value}));
  function searchAll() {
    const query = search.value.trim();
    const current = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
    if (!query && !current.q) return;
    openFilters(query ? {q: query, scope: current.scope} : {}, Object.hasOwn(current, "q"));
  }
  search.addEventListener("input", searchAll);
  byId("search-form").addEventListener("submit", e => { e.preventDefault(); searchAll(); });
  byId("skip").addEventListener("click", e => { e.preventDefault(); reader.focus(); });
  document.addEventListener("keydown", e => {
    const editing = e.target.closest("input,select,textarea,[contenteditable=true]");
    if (e.key === "/" && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); search.focus(); search.select();
    }
  });
  window.addEventListener("hashchange", () => {
    const keepFocus = document.activeElement === search;
    draw();
    if (!keepFocus) reader.focus({preventScroll: true});
    window.scrollTo(0, 0);
  });
  let closedForPrint = [];
  window.addEventListener("beforeprint", () => {
    closedForPrint = [...reader.querySelectorAll("details:not([open])")];
    closedForPrint.forEach(d => { d.open = true; });
  });
  window.addEventListener("afterprint", () => closedForPrint.forEach(d => { d.open = false; }));
  draw();
})();
