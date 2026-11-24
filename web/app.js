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
  const order = globalThis.EntryOrder;
  const itemViews = globalThis.ItemViews;
  const magicCategories = globalThis.MagicCategories;
  const browseViews = globalThis.BrowseViews;
  const monsterViews = globalThis.MonsterViews;
  const collate = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const rarityOrder=["common","uncommon","rare","very rare","legendary","artifact"];
  const compareRarity=(a,b)=>{
    const rank=value=>{const index=rarityOrder.indexOf(String(value).toLowerCase());return index<0?99:index;};
    return rank(a)-rank(b)||collate.compare(a,b);
  };
  const families = [
    ["Characters", ["classes", "races", "backgrounds", "feats"]],
    ["Magic & equipment", ["spells", "items", "magic-items", "weapon-rules"]],
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
  function entryLevel(entry) {
    const value = order.level(entry);
    return value == null ? "" : String(value);
  }
  const levelLabel = value => "Level " + value;
  let all = [];
  const dataBySection = new Map();
  function browseGroup(section, name) {
    return section.key === "classes" ? name.replace(/ archetype$/i, " archetypes") : name;
  }
  const groupsBySection = new Map();
  function indexSection(section) {
    globalThis.MagicItems?.apply(section);
    globalThis.MonsterEditor?.apply(section);
    if (section.key === "monsters") section.count = section.entries.length;
    dataBySection.set(section.key, section.entries.map(entry => {
      const name = norm(entry.name);
      const lead = norm([entry.name, entry.group, section.title,
        section.key === "magic-items" ? magicCategories?.searchTerms(entry) || "" : ""].join(" "));
      const searchable = section.key === "magic-items" && globalThis.MagicItems ? globalThis.MagicItems.searchable(entry)
        : section.key === "monsters" && globalThis.MonsterEditor ? globalThis.MonsterEditor.searchable(entry) : entry.details;
      const body = norm(JSON.stringify(searchable) ?? "").replace(/\\n/g, " ");
      return {section, entry, name, lead, text: lead + " " + body};
    }));
    all = sections.flatMap(section => dataBySection.get(section.key) || []);
    const groups = new Map();
    for (const entry of section.entries) {
      const group = browseGroup(section, entry.group);
      groups.set(group, (groups.get(group) || 0) + 1);
    }
    groupsBySection.set(section.key, [...groups].sort(([a], [b]) => section.key==="magic-items"?compareRarity(a,b):order.compareGroups(section, a, b)));
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
  function matching(items, query, sort = "relevance") {
    const q = norm(query);
    const words = q.split(/\s+/).filter(Boolean);
    const rank = row => row.name === q ? 0 : row.name.startsWith(q) ? 1 : row.name.includes(q) ? 2 :
      words.every(w => row.lead.includes(w)) ? 3 : 4;
    return items.filter(row => words.every(w => row.text.includes(w))).sort((a, b) =>
      (q && sort === "relevance" ? rank(a) - rank(b) : 0) || order.compare(a.entry, b.entry, sort === "relevance" ? "name" : sort) ||
      collate.compare(a.entry.group, b.entry.group) || collate.compare(a.section.title, b.section.title));
  }
  function orderKind(section, group = "") {
    if (["spells", "monsters"].includes(section?.key)) return section.key;
    if (section?.key === "classes" && / archetypes$/i.test(group) && section.entries.some(entry =>
      browseGroup(section, entry.group) === group && order.level(entry) != null)) return "classes";
    return "";
  }
  function sortOptions(kind, query) {
    const options = query ? [["relevance", "Relevance"]] : [];
    if (kind === "spells") options.push(["magic-asc", "Class of magic, level, name"]);
    if (kind === "monsters") options.push(["challenge-asc", "Challenge: low to high"], ["challenge-desc", "Challenge: high to low"]);
    else if (kind) options.push(["level-asc", "Level: low to high"], ["level-desc", "Level: high to low"]);
    options.push(["name", "Name: A–Z"]);
    return options;
  }
  function selectedSort(params, kind, query) {
    const options = sortOptions(kind, query);
    return options.some(([value]) => value === params.sort) ? params.sort : options[0][0];
  }
  function sortControl(params, kind, query) {
    const [field, select] = labelledSelect("Sort", "entry-sort");
    for (const [value, text] of sortOptions(kind, query)) select.append(new Option(text, value));
    select.value = selectedSort(params, kind, query);
    select.addEventListener("change", () => openFilters({...params, sort: select.value, page: ""}));
    return field;
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
      if (section.key === "magic-items") {
        const category = magicCategories?.categories.find(item => item.key === magicCategories.category(entry));
        if (category) info.push(category.title);
        if (entry.details?.type) info.push(entry.details.type);
      }
      const level = section.key === "monsters" ? "" : entryLevel(entry);
      if (level && !info.some(s => /cantrip/i.test(s) && level === "0")) info.push(levelLabel(level));
      if (section.key === "monsters" && order.challenge(entry) != null) info.push("CR " + entry.details.cr);
      a.append(el("span", "result-meta", info.filter(Boolean).map(cap).join(" · ")));
      li.append(a);
      list.append(li);
    }
    wrap.append(list);
    if (nPages > 1) {
      const nav = el("nav", "pagination");
      nav.setAttribute("aria-label", "Result pages");
      if (page > 1) nav.append(link("Previous", {...params, page: page - 1}, "button-link"));
      nav.append(el("span", "", "Page " + page + " of " + nPages));
      if (page < nPages) nav.append(link("Next", {...params, page: page + 1}, "button-link"));
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
    if (section.key === "monsters") reader.className = "monster-manual";
    const base = {section: section.key};
    const categoryViews = section.key === "items" ? itemViews : section.key === "magic-items" ? magicCategories : null;
    const category = categoryViews?.categories.find(item => item.key === params.category);
    const itemGroups = section.key === "items" && category ? new Set(section.entries.filter(entry => itemViews.category(entry) === category.key).map(entry => entry.group)) : null;
    const groups = groupsBySection.get(section.key).filter(([name]) => !itemGroups || itemGroups.has(name));
    const group = browseGroup(section, params.group || "");
    const magicClass = section.key === "spells" ? order.magicClass(group) : "";
    const level = params.level || "";
    const filter = params.filter || "";
    const kind = orderKind(section, group);
    const sort = selectedSort(params, kind, filter);
    const grouped = groups.filter(([name]) => name);
    const compareEntries = ["races", "feats", "backgrounds"].includes(section.key);
    const listView = compareEntries && (params.view === "list" || section.key === "races" && params.view !== "pages");
    const monsterList = section.key === "monsters" && monsterViews && params.view !== "pages";
    const itemHome = section.key === "items" && !category && !group && !filter && !params.browse;
    const magicHome = section.key === "magic-items" && magicCategories && !category && !group && !filter && !params.browse && !params.rarity && !params.type;
    const weaponTree = section.key === "items" && category?.key === "weapons" && !group && params.view !== "pages";
    const baseClassView = section.key === "classes" && !group && !level && !filter && !params.browse;
    const groupedView = !compareEntries && !["classes", "spells", "monsters", "items", "magic-items"].includes(section.key) && grouped.length > 1 && !group && !level && !filter && !params.browse && !params.rarity && !params.type;
    const groupTitle = magicClass || cap(group);
    const parts = [[section.title, group || category ? base : null]];
    if (category) parts.push([category.title, group ? {...base, category: category.key} : null]);
    if (group) parts.push([groupTitle, null]);
    crumbs(parts);
    const head = el("header", "index-heading");
    head.append(heading(group ? groupTitle : category?.title || section.title));
    if (baseClassView) {
      head.append(el("p", "index-intro", "Choose a class to read its features and archetypes."));
      head.append(link("Browse all class entries", {...base, browse: "all"}, "text-link"));
    }
    reader.append(head);
    if (section.key === "spells") {
      const extraGroups = grouped.filter(([name]) => !order.magicClass(name));
      if (extraGroups.length) {
        const extra = el("nav", "related spell-reference-links");
        extra.setAttribute("aria-label", "Hexes and magic references");
        for (const [name] of extraGroups) extra.append(link(cap(name), {...base, group: name}, "related-link"));
        head.append(extra);
      }
    }
    if (section.key === "magic-items" && globalThis.MagicItems) {
      head.append(el("p", "index-intro", "Converted for the Varis rules. Browse the collection or open an item to edit its rules."));
      head.append(link("Using converted magic items",{section:"rules",group:"Magic items",entry:"Using converted magic items"},"text-link"));
      reader.append(globalThis.MagicItems.toolbar(section, () => {indexSection(section);draw();}));
    }
    if (section.key === "monsters" && globalThis.MonsterEditor) {
      head.append(el("p", "index-intro", "Browse creature statblocks, add your own monster, or edit an existing creature for your table."));
      head.append(link("Monster conversion and editing", {section:"rules", group:"Monsters", entry:"Using converted monsters"}, "text-link"));
      reader.append(globalThis.MonsterEditor.toolbar(section, updated => {
        indexSection(section);
        if (updated) openFilters(entryRoute(section, updated)); else draw();
      }));
    }
    if (section.key === "monsters" && monsterViews) {
      const types = el("nav", "monster-type-nav");
      types.setAttribute("aria-label", "Creature types");
      const available = new Set(section.entries.flatMap(entry => monsterViews.metadata(entry).types));
      for (const [value, title] of [["", "All monsters"], ...[...new Set([...monsterViews.types, "object", "unknown"])].filter(type => available.has(type)).map(type => [type, monsterViews.titles[type] || cap(type)])]) {
        const control = link("", {...params, type:value, page:"", browse:"all"}, "monster-type-chip");
        control.append(el("span", "monster-type-mark", value ? title.slice(0,2).toUpperCase() : "ALL"), el("span", "", title));
        if ((params.type || "") === value) control.setAttribute("aria-current", "true");
        types.append(control);
      }
      reader.append(types);
    }
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
    if (section.key === "items" && itemViews) {
      const [field, select] = labelledSelect("Category", "item-category");
      select.append(new Option("All categories", ""));
      for (const item of itemViews.categories) select.append(new Option(item.title, item.key));
      select.value = category?.key || "";
      select.addEventListener("change", () => openFilters({...params, category: select.value, group: "", view: "", page: "", browse: ""}));
      form.append(field);
    }
    if (compareEntries || section.key === "monsters" || category?.key === "weapons" && !group) {
      const [field, select] = labelledSelect("Display", "entry-view");
      const options = section.key === "monsters" ? [["list", "Expandable list"], ["pages", "Pages"]] : compareEntries ? [["pages", "Pages"], ["list", "Expandable list"]] : [["tree", "Weapon groups"], ["pages", "Pages"]];
      for (const [value, text] of options) select.append(new Option(text, value));
      select.value = section.key === "monsters" ? monsterList ? "list" : "pages" : compareEntries ? listView ? "list" : "pages" : weaponTree ? "tree" : "pages";
      select.addEventListener("change", () => openFilters({...params, view: select.value, page: "", browse: "all"}));
      form.append(field);
    }
    if (section.key === "spells") {
      const [field, select] = labelledSelect("Class of magic", "group");
      select.append(new Option("All classes of magic", ""));
      for (const name of order.magicClasses) select.append(new Option(name, name));
      select.value = magicClass;
      select.addEventListener("change", () => openFilters({...params, group: select.value, browse: "all", page: ""}));
      form.append(field);
    } else if (grouped.length > 1 && !baseClassView && section.key !== "magic-items" && !itemHome) {
      const [field, select] = labelledSelect("Group", "group");
      select.append(new Option("All groups", ""));
      for (const [title] of grouped) select.append(new Option(cap(title), title));
      select.value = group;
      select.addEventListener("change", () => openFilters({...params, group: select.value, browse: "all", page: ""}));
      form.append(field);
    }
    if (section.key === "spells") {
      const levels = [...new Set(section.entries.map(entryLevel).filter(Boolean))].sort(collate.compare);
      if (levels.length) {
        const [field, select] = labelledSelect("Spell level", "spell-level");
        select.append(new Option("All levels", ""));
        for (const l of levels) select.append(new Option(levelLabel(l), l));
        select.value = level;
        select.addEventListener("change", () => openFilters({...params, level: select.value, browse: "all", page: ""}));
        form.append(field);
      }
    }
    if (section.key === "magic-items") {
      if (magicCategories) {
        const [field, select] = labelledSelect("Category", "magic-category");
        select.append(new Option("All categories", ""));
        for (const item of magicCategories.categories) select.append(new Option(item.title, item.key));
        select.value = category?.key || "";
        select.addEventListener("change", () => openFilters({...params, category: select.value, page: "", browse: "all"}));
        form.append(field);
      }
      for (const [key, title] of [["rarity", "Rarity"], ["type", "Item type"]]) {
        const values = [...new Set(section.entries.map(entry => String(entry.details?.[key] || "")).filter(Boolean))].sort(key==="rarity"?compareRarity:collate.compare);
        if (!values.length) continue;
        const [field, select] = labelledSelect(title, "magic-" + key);
        select.append(new Option("All " + (key === "rarity" ? "rarities" : "types"), ""));
        values.forEach(value => select.append(new Option(cap(value), value)));
        select.value = params[key] || (key==="rarity"?group:"");
        select.addEventListener("change", () => openFilters({...params,[key]:select.value,...(key==="rarity"?{group:""}:{}),page:"",browse:"all"}));
        form.append(field);
      }
    }
    if (kind) form.append(sortControl(params, kind, filter));
    if (section.key === "monsters" && monsterViews) {
      const [typeField, typeSelect] = labelledSelect("Creature type", "monster-type");
      typeSelect.append(new Option("All types", ""));
      const types = [...new Set(section.entries.flatMap(entry => monsterViews.metadata(entry).types))].sort(collate.compare);
      for (const type of types) typeSelect.append(new Option(monsterViews.titles[type] || cap(type), type));
      typeSelect.value = params.type || "";
      typeSelect.addEventListener("change", () => openFilters({...params, type:typeSelect.value, page:"", browse:"all"}));
      const [crField, crSelect] = labelledSelect("Challenge rating", "monster-cr");
      crSelect.append(new Option("All CRs", ""));
      const values = new Map();
      for (const entry of section.entries) { const meta = monsterViews.metadata(entry); if (meta.challenge !== null && !values.has(meta.challenge)) values.set(meta.challenge, meta.cr); }
      for (const [, cr] of [...values].sort(([a],[b])=>a-b)) crSelect.append(new Option("CR " + cr, cr));
      for (const [value, title] of [["0-1","CR 0–1"],["2-5","CR 2–5"],["6-10","CR 6–10"],["11-16","CR 11–16"],["17+","CR 17+"],["unknown","Unrated / unknown"]]) crSelect.append(new Option(title, value));
      crSelect.value = params.cr || "";
      crSelect.addEventListener("change", () => openFilters({...params, cr:crSelect.value, page:"", browse:"all"}));
      form.append(typeField, crField);
    }
    reader.append(form);
    if (!section.entries.length) {
      reader.append(el("p", "state-message", "This section has no entries yet."));
      return;
    }
    if (itemHome && itemViews) {
      const shelves = el("div", "groups item-categories");
      for (const item of itemViews.categoriesFor(section.entries)) {
        shelves.append(panelLink(item.title, item.count, {...base, category: item.key}));
      }
      reader.append(shelves);
      return;
    }
    if (magicHome) {
      const subhead = el("div", "subhead");
      subhead.append(el("h2", "", "Browse by category"), link("Browse all " + countText(section.entries.length), {...base, browse: "all"}, "text-link"));
      const shelves = el("div", "groups magic-categories");
      for (const item of magicCategories.categoriesFor(section.entries)) {
        const card = panelLink(item.title, item.count, {...base, category: item.key});
        card.append(el("span", "panel-examples", item.entries.slice(0, 2).map(entry => cap(entry.name)).join(" · ")));
        shelves.append(card);
      }
      const rarities = el("nav", "related magic-rarity-links");
      rarities.setAttribute("aria-label", "Browse magic items by rarity");
      for (const [name, count] of grouped) rarities.append(link(cap(name) + " (" + count + ")", {...base, group: name}, "related-link"));
      reader.append(subhead, shelves, el("h2", "general-heading", "Browse by rarity"), rarities);
      return;
    }
    if (baseClassView && browseViews) {
      reader.append(browseViews.classDirectory(section, {el, link, entryRoute, renderDetails: details}));
      byId("announcement").textContent = countText(section.entries.filter(entry => entry.group === "Base class").length);
      return;
    }
    if (groupedView) {
      const groupsHead = el("div", "subhead");
      groupsHead.append(el("h2", "", section.key==="magic-items"?"Browse by rarity":"Browse by group"), link("Browse all " + countText(section.entries.length), {...base, browse: "all"}, "text-link"));
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
        (!group || (magicClass ? order.magicClass(entry) === magicClass : browseGroup(section, entry.group) === group)) && (!level || entryLevel(entry) === level) &&
        (!category || categoryViews.category(entry) === category.key) &&
        (section.key !== "magic-items" || ((!params.rarity || entry.details?.rarity === params.rarity) && (!params.type || entry.details?.type === params.type))) &&
        (section.key !== "monsters" || !monsterViews || monsterViews.matches(entry, params)));
      const matches = matching(rows, filter, sort);
      if (matches.length && monsterList) {
        const count = countText(matches.length); byId("announcement").textContent = count;
        reader.append(el("p", "result-count", count), monsterViews.expandableList(matches, {
          el, link, entryRoute, renderDetails:(entry, body)=>body.append(monsterBlock(entry)),
          editor:(currentSection, entry)=>globalThis.MonsterEditor?.editor(currentSection, entry, updated=>{
            indexSection(currentSection); if (updated) openFilters(entryRoute(currentSection, updated)); else draw();
          })
        }));
      } else if (matches.length && (listView && browseViews || weaponTree && itemViews)) {
        const count = countText(matches.length);
        byId("announcement").textContent = count;
        reader.append(el("p", "result-count", count));
        reader.append(listView ? browseViews.expandableList(matches, {el, link, entryRoute, renderDetails: details}) : weaponDirectory(matches));
      } else reader.append(resultList(matches, baseClassView ? {...params, group: "Base class"} : params));
    }
  }
  function weaponDirectory(rows) {
    const section = rows[0].section;
    const tree = el("div", "weapon-tree");
    function branch(node, depth) {
      const block = el("details", "weapon-branch");
      const summary = el("summary", "", cap(node.title));
      summary.append(el("span", "tree-count", countText(node.count)));
      block.append(summary);
      block.open = depth === 0;
      if (node.entries) {
        const list = el("ul", "weapon-list");
        for (const entry of node.entries) {
          const item = el("li");
          item.append(link(cap(entry.name), entryRoute(section, entry), "weapon-entry-link"));
          if (entry.details?.damage) item.append(el("span", "result-meta", String(entry.details.damage)));
          list.append(item);
        }
        block.append(list);
      } else for (const child of node.children) block.append(branch(child, depth + 1));
      return block;
    }
    for (const node of itemViews.weaponTree(rows.map(row => row.entry))) tree.append(branch(node, 0));
    return tree;
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
    select.addEventListener("change", () => {
      const next = {...params, scope: select.value, page: ""};
      const kind = orderKind(sectionByKey.get(select.value));
      if (!sortOptions(kind, params.q).some(([value]) => value === next.sort)) next.sort = "";
      openFilters(next);
    });
    const toolbar = el("div", "filters search-scope");
    const kind = orderKind(sectionByKey.get(params.scope));
    toolbar.append(field, sortControl(params, kind, params.q));
    reader.append(toolbar, resultList(matching(dataBySection.get(params.scope) || all, params.q, selectedSort(params, kind, params.q)), params));
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
  function traitChildren(value, depth) {
    const list = el("ul", "trait-children");
    const children = Array.isArray(value) ? value : plain(value) || ["name", "desc", "description"].some(key => Object.hasOwn(value, key))
      ? [value] : Object.entries(value).map(([name, body]) => ({[name]: body}));
    for (const item of children) {
      const child = el("li", "trait-child");
      child.append(renderValue(item, depth));
      list.append(child);
    }
    return list;
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
      else if (key === "minitrait_list") output.append(traitChildren(item, depth + 1));
      else if (key === "sections" && isSections(item)) output.append(renderValue(item, depth));
      else output.append(textField(key, item, depth));
    }
    return output;
  }
  const statKeys = new Set(["damage", "type", "types", "size", "speed", "lvl", "level", "casting", "casting_time",
    "range", "duration", "components", "cooldown", "target", "weight", "cost", "attribute_bonuses", "tradition", "school", "status",
    "prerequisite", "prerequisites", "requirements", "save", "base ac", "ac bonus", "current_rules", "rarity", "attunement",
    "price", "base_item", "magic_bonus", "category"]);
  function details(entry, target = reader) {
    const value = entry.details;
    if (plain(value) || Array.isArray(value) || isTable(value)) {
      target.append(renderValue(value, 2, entry.name));
      return;
    }
    const stats = el("dl", "stats");
    const intro = fragment();
    const chapters = [];
    const provenance = [];
    const sourceFields = {};
    for (const [key, item] of Object.entries(value)) {
      if ((key === "name" && item === entry.name) || (key === "group" && item === entry.group)) continue;
      if (key === "id") continue;
      if (entry.source?.startsWith("magic-items/") && /^(?:original_|source_|conversion_notes$)/.test(key)) {
        if(/^source_/.test(key)){sourceFields[key.replace(/^source_/,"")]=item;continue;}
        const block=el("details","chapter magic-provenance");
        block.append(el("summary","",key === "original_5e" ? "Original 5e text" : label(key)),renderValue(item,3,label(key)));
        provenance.push(block);continue;
      }
      if (key === "summons") continue;
      if (key === "minitrait_list") { intro.append(traitChildren(item, 2)); continue; }
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
        const display = key === "category" && entry.source?.startsWith("magic-items/")
          ? magicCategories?.categories.find(category => category.key === magicCategories.category(entry))?.title || item : item;
        val.append(inline(Array.isArray(display) ? display.join(", ") : display ?? "-"));
        stat.append(el("dt", "", label(key)), val);
        stats.append(stat);
      } else chapters.push({heading: label(key), body: item});
    }
    if(Object.keys(sourceFields).length){
      const block=el("details","chapter magic-provenance");
      block.append(el("summary","","Source workbook"),renderValue(sourceFields,3,"Source workbook"));
      provenance.push(block);
    }
    if (stats.childElementCount) target.append(stats);
    target.append(intro);
    if(provenance.length) {
      // The converted rules lead; source comparisons stay closed until requested.
      for(const item of chapters)target.append(textField(item.heading,item.body,2));
      target.append(...provenance);return;
    }
    const long = chapters.length > 4 || (chapters.length > 1 && JSON.stringify(chapters).length > 4200);
    if (!long) {
      for (const item of chapters) target.append(textField(item.heading, item.body, 2));
      return;
    }
    // Comparison entries can coexist; only the standalone entry needs a jump picker.
    if (target !== reader) {
      for (const item of chapters) target.append(textField(item.heading, item.body, 2));
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
      .sort((a, b) => order.compare(a, b, "level-asc"));
    if (!children.length) return null;
    const block = el("section", "class-archetypes");
    block.append(el("h2", "", cap(entry.name) + " archetypes"));
    const list = el("ul", "archetype-list");
    for (const child of children) {
      const item = el("li");
      item.append(link(cap(child.name), entryRoute(section, child)));
      if (order.level(child) != null) item.append(el("span", "result-meta", " · " + levelLabel(order.level(child))));
      list.append(item);
    }
    block.append(list);
    return block;
  }
  function monsterBlock(entry, depth = 2) {
    if (monsterViews) return monsterViews.statblock(entry, {el, renderValue, link, prose, depth, showTitle:true});
    const block = el("div", "stat-block");
    const value = entry.details || {};
    const known = new Set(["id", "name", "group", "meta", "size", "type", "alignment", "abilities", "traits", "actions", "bonus_actions", "reactions", "legendary_actions", "mythic_actions", "lair_actions", "regional_effects", "spell_references", "notes", "source_ref", "status", "description", "desc"]);
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
    if (Array.isArray(value.spell_references) && value.spell_references.length) {
      const spells = el("section", "field monster-spells");
      spells.append(el("h" + Math.min(depth, 6), "", "Current spell rules"));
      const list = el("ul", "rule-list");
      for (const reference of value.spell_references) {
        const row = el("li");
        row.append(link(reference.name, {section:"spells", entry:reference.name, group:reference.group}));
        if (reference.source_spell && norm(reference.source_spell) !== norm(reference.name)) {
          row.append(document.createTextNode(" (replaces " + reference.source_spell + ")"));
        }
        if (reference.rule) row.append(prose(reference.rule));
        list.append(row);
      }
      spells.append(list); block.append(spells);
    }
    for (const key of ["traits", "actions", "bonus_actions", "reactions", "legendary_actions", "mythic_actions", "lair_actions", "regional_effects"]) {
      if (value[key]?.length) block.append(textField(key, value[key], depth));
    }
    const provenance = [];
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:original_|source_|conversion_|replacement_sources$|fallback_reference$)/.test(key)) {
        const fold = el("details", "chapter monster-provenance");
        fold.append(el("summary", "", key === "original_5e" ? "Original source statblock" : label(key)), renderValue(item, depth + 1, label(key)));
        provenance.push(fold);
        continue;
      }
      if (!known.has(key) && item != null && item !== "") block.append(textField(key, item, depth));
    }
    if (value.notes?.length) block.append(textField("notes", value.notes, depth));
    block.append(...provenance);
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
      const monster = section?.entries.find(candidate => norm(candidate.name) === norm(reference.monster)
        || candidate.monster_target && norm(candidate.monster_target.name) === norm(reference.monster));
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
  function entryNavigation(section, entry) {
    const categoryViews = section.key === "items" ? itemViews : section.key === "magic-items" ? magicCategories : null;
    const category = categoryViews?.category(entry);
    const kind = orderKind(section, browseGroup(section, entry.group));
    const siblings = section.entries.filter(candidate => candidate.group === entry.group &&
      (!category || categoryViews.category(candidate) === category)).slice()
      .sort((a, b) => order.compare(a, b, selectedSort({}, kind, "")));
    const index = siblings.indexOf(entry);
    const nav = el("nav", "entry-navigation");
    nav.setAttribute("aria-label", "Entry navigation");
    for (const [text, offset] of [["Previous", -1], ["Next", 1]]) {
      if (offset === 1) nav.append(el("span", "entry-position", (index + 1) + " of " + siblings.length));
      const sibling = siblings[index + offset];
      const control = sibling ? link(text, entryRoute(section, sibling), "button-link") : el("span", "button-link is-disabled", text);
      if (sibling) {
        control.setAttribute("aria-label", text + " entry: " + cap(sibling.name));
        control.title = cap(sibling.name);
      } else control.setAttribute("aria-disabled", "true");
      nav.append(control);
    }
    return nav;
  }
  function showEntry(section, entry) {
    if (section.key === "monsters" && monsterViews) reader.classList.add("monster-page");
    const base = {section: section.key};
    const parts = [[section.title, base]];
    const categoryViews = section.key === "items" ? itemViews : section.key === "magic-items" ? magicCategories : null;
    const category = categoryViews?.categories.find(item => item.key === categoryViews.category(entry));
    if (category) parts.push([category.title, {...base, category: category.key}]);
    if (entry.group) parts.push([cap(entry.group), {...base, ...(category ? {category: category.key} : {}), group: entry.group}]);
    parts.push([cap(entry.name), null]);
    crumbs(parts);
    const header = el("header", "entry-heading");
    header.append(heading(cap(entry.name)), entryNavigation(section, entry));
    if (section.key === "monsters" && monsterViews) header.querySelector("h1")?.classList.add("sr-only");
    if (section.key === "classes") {
      const links = classLinks(section, entry);
      if (links.childElementCount) header.append(links);
    }
    reader.append(header);
    if (section.key === "magic-items" && globalThis.MagicItems) {
      header.append(globalThis.MagicItems.editor(section, entry, updated => {
        indexSection(section);
        if(updated && location.hash !== href(entryRoute(section,updated)))openFilters(entryRoute(section,updated));else draw();
      }));
    }
    if (section.key === "monsters" && globalThis.MonsterEditor) {
      header.append(globalThis.MonsterEditor.editor(section, entry, updated => {
        indexSection(section);
        if (updated && location.hash !== href(entryRoute(section, updated))) openFilters(entryRoute(section, updated)); else draw();
      }));
    }
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
    openFilters(query ? {q: query, scope: current.scope, sort: current.sort} : {}, Object.hasOwn(current, "q"));
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
