"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const reader = byId("reader");
  const trail = byId("trail");
  const search = byId("search");
  const picker = byId("section-picker");
  const portable = globalThis.DND_CATALOG;
  const catalog = globalThis.DndCatalog || {
    ready: Promise.resolve(portable || []),
    loadSection: key => Promise.resolve((portable || []).find(section => section.key === key)),
    loadAll: () => Promise.resolve(portable || [])
  };
  const sections = [];
  const sectionByKey = new Map();
  const loadedSections = new Set();
  const sectionRequests = new Map();
  const perPage = 24;
  const collate = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const families = [
    ["Characters", ["classes", "races", "backgrounds", "feats"]],
    ["Magic & equipment", ["spells", "items", "weapon-rules"]],
    ["At the table", ["rules", "conditions", "monsters", "design-notes"]]
  ];
  let initialized = false;
  let initializing;

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
  let all = [];
  const dataBySection = new Map();
  function browseGroup(section, name) {
    return section.key === "classes" ? name.replace(/ archetype$/i, " archetypes") : name;
  }
  const groupsBySection = new Map();
  function indexSection(section) {
    dataBySection.set(section.key, section.entries.map(entry => {
      const name = norm(entry.name);
      const lead = norm([entry.name, entry.group, section.title].join(" "));
      const body = norm(JSON.stringify(entry.details) ?? "").replace(/\\n/g, " ");
      return {section, entry, name, lead, text: lead + " " + body};
    }));
    all = sections.flatMap(section => dataBySection.get(section.key) || []);
    const groups = new Map();
    for (const entry of section.entries) {
      const group = browseGroup(section, entry.group);
      groups.set(group, (groups.get(group) || 0) + 1);
    }
    groupsBySection.set(section.key, [...groups].sort(([a], [b]) =>
      Number(b === "Base class") - Number(a === "Base class") || collate.compare(a, b)));
  }
  function initialize() {
    if (initialized) return Promise.resolve();
    if (initializing) return initializing;
    initializing = Promise.resolve(catalog.ready).then(manifest => {
      sections.push(...manifest);
      for (const section of sections) {
        sectionByKey.set(section.key, section);
        if (!globalThis.DndCatalog || catalog.isLoaded?.(section.key) || section.entries.length || section.count === 0) {
          loadedSections.add(section.key);
          indexSection(section);
        }
      }
      const assigned = new Set(families.flatMap(([, keys]) => keys));
      const other = sections.filter(section => !assigned.has(section.key));
      if (other.length) families.push(["More sections", other.map(section => section.key)]);
      for (const [family, keys] of families) {
        const group = el("optgroup");
        group.label = family;
        for (const key of keys) {
          const section = sectionByKey.get(key);
          if (section) group.append(new Option(section.title, section.key));
        }
        if (group.childElementCount) picker.append(group);
      }
      initialized = true;
    }).catch(error => { initializing = null; throw error; });
    return initializing;
  }
  function loadSection(key) {
    if (loadedSections.has(key)) return Promise.resolve(sectionByKey.get(key));
    if (sectionRequests.has(key)) return sectionRequests.get(key);
    const request = Promise.resolve().then(() => catalog.loadSection(key)).then(section => {
      loadedSections.add(key);
      indexSection(section);
      return section;
    }).finally(() => sectionRequests.delete(key));
    sectionRequests.set(key, request);
    return request;
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
      for (const s of members) shelf.append(panelLink(s.title, s.count ?? s.entries.length, {section: s.key}));
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
    const baseClassView = section.key === "classes" && !group && !level && !filter && !params.browse;
    const groupedView = section.key !== "classes" && grouped.length > 1 && !group && !level && !filter && !params.browse;
    const parts = [[section.title, group ? base : null]];
    if (group) parts.push([cap(group), null]);
    crumbs(parts);
    const head = el("header", "index-heading");
    head.append(heading(group ? cap(group) : section.title));
    if (baseClassView) {
      head.append(el("p", "index-intro", "Choose a class to read its features and archetypes."));
      head.append(link("Browse all class entries →", {...base, browse: "all"}, "text-link"));
    }
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
    if (grouped.length > 1 && !baseClassView) {
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
        (!baseClassView || entry.group === "Base class") &&
        (!group || browseGroup(section, entry.group) === group) && (!level || spellLevel(entry) === level));
      reader.append(resultList(matching(rows, filter), baseClassView ? {...params, group: "Base class"} : params));
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
      if (key === "summons") continue;
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
    if (entry.group !== "Base class") {
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
  function classArchetypes(section, entry) {
    if (entry.group !== "Base class") return null;
    const children = section.entries.filter(child => norm(browseGroup(section, child.group)) === norm(entry.name + " archetypes"))
      .sort((a, b) => collate.compare(a.name, b.name));
    if (!children.length) return null;
    const block = el("section", "class-archetypes");
    block.append(el("h2", "", cap(entry.name) + " archetypes"));
    const list = el("ul", "archetype-list");
    for (const child of children) {
      const item = el("li");
      item.append(link(cap(child.name), entryRoute(section, child)));
      list.append(item);
    }
    block.append(list);
    return block;
  }
  function monsterBlock(entry, depth = 2) {
    const block = el("div", "stat-block");
    const value = entry.details || {};
    const known = new Set(["name", "group", "meta", "size", "type", "alignment", "abilities", "traits", "actions", "bonus_actions", "reactions", "legendary_actions", "notes", "source_ref", "status", "description", "desc"]);
    if (value.status) block.append(el("p", "monster-status", value.status));
    const meta = value.meta || [value.size, value.type, value.alignment].filter(Boolean).join(" · ");
    if (meta) block.append(plain(meta) ? el("p", "monster-meta", meta) : renderValue(meta, depth));
    const statLabels = {ac: "Armor class", hp: "Hit points", block: "Block", speed: "Speed", cr: "Challenge"};
    const stats = el("dl", "stats monster-stats");
    for (const [key, title] of Object.entries(statLabels)) {
      known.add(key);
      if (value[key] == null || value[key] === "") continue;
      const item = el("div");
      const description = el("dd");
      description.append(renderValue(value[key], depth + 1));
      item.append(el("dt", "", title), description);
      stats.append(item);
    }
    if (stats.childElementCount) block.append(stats);
    const abilities = el("dl", "stats monster-abilities");
    for (const [key, title] of Object.entries({str:"Strength", dex:"Dexterity", con:"Constitution", int:"Intelligence", wis:"Wisdom", cha:"Charisma"})) {
      if (value.abilities?.[key] == null) continue;
      const item = el("div");
      const score = el("dd");
      score.append(renderValue(value.abilities[key], depth + 1));
      item.append(el("dt", "", title), score);
      abilities.append(item);
    }
    if (abilities.childElementCount) block.append(abilities);
    if (value.description || value.desc) block.append(prose(value.description || value.desc));
    for (const key of ["traits", "actions", "bonus_actions", "reactions", "legendary_actions"]) {
      if (value[key]?.length) block.append(textField(key, value[key], depth));
    }
    for (const [key, item] of Object.entries(value)) {
      if (!known.has(key) && item != null && item !== "") block.append(textField(key, item, depth));
    }
    if (value.notes?.length) block.append(textField("notes", value.notes, depth));
    if (value.source_ref) block.append(textField("source_ref", value.source_ref, depth));
    return block;
  }
  function summonPicker(entry) {
    const references = entry.details?.summons;
    if (!Array.isArray(references) || !references.length) return null;
    const section = sectionByKey.get("monsters");
    const block = el("section", "summon-picker");
    block.setAttribute("aria-label", "Summoned creatures");
    block.append(el("h2", "", "Summoned creatures"));
    const tools = el("div", "summon-controls");
    const previous = el("button", "button-link", "Previous");
    const next = el("button", "button-link", "Next");
    previous.type = next.type = "button";
    const count = el("span", "summon-position");
    count.setAttribute("aria-live", "polite");
    tools.append(previous, count, next);
    const track = el("div", "summon-track");
    track.tabIndex = 0;
    track.setAttribute("role", "region");
    track.setAttribute("aria-label", "Creature stat blocks; swipe or use Previous and Next");
    const cards = references.map(reference => {
      const card = el("article", "summon-card");
      const monster = section?.entries.find(candidate => norm(candidate.name) === norm(reference.monster));
      const title = el("h3", "summon-title");
      if (monster) title.append(link(reference.label || cap(monster.name), entryRoute(section, monster)));
      else title.textContent = reference.label || reference.monster;
      card.append(title);
      if (reference.notes) card.append(prose(reference.notes));
      if (monster) card.append(monsterBlock(monster, 4));
      else card.append(el("p", "state-message", "This creature's stat block is not available yet."));
      track.append(card);
      return card;
    });
    let index = 0;
    function update(nextIndex) {
      index = Math.max(0, Math.min(cards.length - 1, nextIndex));
      previous.disabled = index === 0;
      next.disabled = index === cards.length - 1;
      count.textContent = (index + 1) + " of " + cards.length;
    }
    function move(delta) {
      update(index + delta);
      track.scrollTo({left: cards[index].offsetLeft ?? index * track.clientWidth, behavior: "smooth"});
    }
    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    track.addEventListener("scroll", () => {
      const step = cards[1]?.offsetLeft || track.clientWidth;
      if (step) update(Math.round(track.scrollLeft / step));
    });
    track.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
    update(0);
    if (cards.length > 1) block.append(tools);
    block.append(track);
    return block;
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
    if (section.key === "classes") {
      const archetypes = classArchetypes(section, entry);
      if (archetypes) reader.append(archetypes);
    }
    if (section.key === "monsters") reader.append(monsterBlock(entry));
    else details(entry);
    const summons = summonPicker(entry);
    if (summons) reader.append(summons);
    const footer = el("footer", "entry-footer");
    if (entry.source) {
      const source = el("p", "source-file", "Source file ");
      source.append(el("code", "", "data/" + entry.source));
      footer.append(source);
    }
    if (footer.childElementCount) reader.append(footer);
  }
  let drawVersion = 0;
  function loading(title) {
    reader.replaceChildren();
    reader.className = "";
    reader.setAttribute("aria-busy", "true");
    crumbs([]);
    reader.append(heading(title), el("p", "state-message", "Loading rules…"));
  }
  function loadError(section) {
    reader.replaceChildren();
    reader.className = "";
    crumbs([]);
    reader.append(heading("Rules unavailable"), el("p", "state-message", "We could not load " + (section?.title || "the compendium") + ". Check your connection and try again."));
    const retry = el("button", "button-link", initialized ? "Try again" : "Reload compendium");
    retry.type = "button";
    retry.addEventListener("click", () => initialized ? draw() : location.reload());
    reader.append(retry);
    if (location.protocol === "file:") {
      const message = el("p", "state-message", "For browsing downloaded files, use the ");
      const offline = el("a", "text-link", "offline compendium");
      offline.href = "offline/index.html";
      message.append(offline, document.createTextNode("."));
      reader.append(message);
    }
  }
  async function draw() {
    const version = ++drawVersion;
    const oldInput = document.activeElement?.id;
    const selection = oldInput === "section-search" ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const params = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
    let section;
    try {
      if (!initialized) loading("Loading compendium");
      await initialize();
      if (version !== drawVersion) return false;
      section = sectionByKey.get(params.section);
      picker.value = section?.key || "";
      if (search.value.trim() !== (params.q || "")) search.value = params.q || "";
      const required = params.q ? (sectionByKey.has(params.scope) ? [params.scope] : sections.map(item => item.key)) : section ? [section.key] : [];
      if (required.some(key => !loadedSections.has(key))) {
        loading(params.q ? "Loading search" : "Loading " + section.title.toLowerCase());
        await Promise.all(required.map(loadSection));
        if (version !== drawVersion) return false;
      }
      const entry = section && params.entry ? section.entries.find(e => e.name === params.entry && (!params.group || e.group === params.group)) : null;
      if (!params.q && entry?.details?.summons?.length && sectionByKey.has("monsters") && !loadedSections.has("monsters")) {
        loading("Loading summoned creatures");
        await loadSection("monsters");
        if (version !== drawVersion) return false;
      }
      reader.replaceChildren();
      reader.className = "";
      byId("announcement").textContent = "";
      if (params.q) globalResults(params);
      else if (section && params.entry) {
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
    } catch (error) {
      if (version !== drawVersion) return false;
      loadError(section);
    } finally {
      if (version === drawVersion) reader.setAttribute("aria-busy", "false");
    }
    return true;
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
    draw().then(rendered => { if (rendered && !keepFocus) reader.focus({preventScroll: true}); });
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
