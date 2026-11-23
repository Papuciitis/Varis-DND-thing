"use strict";

// Presentation-only item shelves: source groups and saved entry identities stay intact.
(() => {
  const normalize = value => String(value ?? "").trim().toLowerCase();
  const collate = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const categories = Object.freeze([
    {key: "weapons", title: "Weapons"},
    {key: "armor-shields", title: "Armor & shields"},
    {key: "items", title: "Items"},
    {key: "consumables", title: "Consumables"},
    {key: "materials", title: "Materials"},
    {key: "plants-fungi", title: "Special plants & fungi"}
  ].map(Object.freeze));
  const materialGroups = new Set(["semi-mundane materials", "special metals and alloys"]);
  const materialPieces = new Set(["ironwood twig", "memory stone fragment", "forge amber"]);
  const consumableGroups = new Set(["potions", "flasks and similar consumables", "arcane consumables and magical components"]);

  function category(entry) {
    const details = entry?.details || {}, group = normalize(entry?.group), type = normalize(details.type);
    if (/^(?:light|medium|heavy) (?:armou?r|shields?)$/.test(group)
      || details["Base AC"] !== undefined || details["AC bonus"] !== undefined) return "armor-shields";
    if (group === "ammunition" || type === "ammunition") return "items";
    if (entry?.source === "weapons.yaml"
      || (["simple", "martial"].includes(type) && details.damage !== undefined)) return "weapons";
    if (group === "special flora and fungus" || group === "special plants & fungi") return "plants-fungi";
    if (materialGroups.has(group) || materialPieces.has(normalize(entry?.name))) return "materials";
    if (consumableGroups.has(group) || type === "potion" || normalize(entry?.name) === "vial of mosa") return "consumables";
    return "items";
  }

  function categoriesFor(entries) {
    return categories.map(shelf => {
      const members = (entries || []).filter(entry => category(entry) === shelf.key);
      return {...shelf, count: members.length, entries: members};
    });
  }

  function weaponKind(entry) {
    const type = normalize(entry.details?.type);
    return ["simple", "martial"].includes(type) ? type : "other";
  }

  function weaponRange(entry) {
    const group = normalize(entry.details?.group || entry.group);
    const properties = Array.isArray(entry.details?.properties)
      ? entry.details.properties.join(", ") : String(entry.details?.properties || "");
    // A throwing option does not turn a melee dagger into a ranged weapon.
    return /^thrown\b/.test(group) || /(?:^|[,;])\s*range\s+\d/i.test(properties) ? "ranged" : "melee";
  }

  function weaponTree(entries) {
    const weapons = (entries || []).filter(entry => category(entry) === "weapons");
    return ["simple", "martial", "other"].flatMap(kind => {
      const members = weapons.filter(entry => weaponKind(entry) === kind);
      if (!members.length) return [];
      const children = ["melee", "ranged"].flatMap(range => {
        const ranged = members.filter(entry => weaponRange(entry) === range);
        if (!ranged.length) return [];
        const groups = new Map();
        for (const entry of ranged) {
          const title = String(entry.details?.group || entry.group || "Other weapons");
          const key = normalize(title);
          if (!groups.has(key)) groups.set(key, {key, title, entries: []});
          groups.get(key).entries.push(entry);
        }
        const children = [...groups.values()].sort((a, b) => collate.compare(a.title, b.title)).map(group => ({
          ...group, count: group.entries.length,
          entries: [...group.entries].sort((a, b) => collate.compare(a.name, b.name))
        }));
        return [{key: range, title: range === "melee" ? "Melee" : "Ranged", count: ranged.length, children}];
      });
      return [{key: kind, title: kind === "other" ? "Other weapons" : kind === "simple" ? "Simple weapons" : "Martial weapons", count: members.length, children}];
    });
  }

  globalThis.ItemViews = Object.freeze({categories, category, categoriesFor, weaponTree});
})();
