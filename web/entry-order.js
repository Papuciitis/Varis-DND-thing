"use strict";

// One numeric ordering contract for the reader, pickers and saved-sheet views.
(() => {
  const collate = new Intl.Collator("en", {numeric:true, sensitivity:"base"});
  const normalizeGroup = value => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const magicClasses = Object.freeze(["Arcane", "Oath", "Occult", "Mystic"]);
  function magicClass(entry) {
    const candidates = typeof entry === "string" ? [entry] : [entry?.group, entry?.tradition, entry?.details?.tradition];
    for (const value of candidates) {
      const group = normalizeGroup(value).replace(/\s+/g, " ");
      const name = group.match(/^(arcane|oath|occult|mystic)(?: (?:cantrips?|spells?))?$/)?.[1];
      if (name) return magicClasses.find(item => normalizeGroup(item) === name);
    }
    // Hex magic is explicitly separate from the four classes in the source rules.
    return "";
  }
  const spellGroupOrder = new Map([
    "Arcane cantrips", "Arcane spells", "Mystic cantrips", "Mystic spells",
    "Oath cantrips", "Oath spells", "Occult cantrips", "Occult spells",
    "Minor hexes", "Major hexes", "Greater hexes"
  ].map((name, index) => [normalizeGroup(name), index]));
  function compareGroups(section, a, b) {
    if ((typeof section === "string" ? section : section?.key) === "spells") {
      const rank = name => spellGroupOrder.get(normalizeGroup(name)) ?? spellGroupOrder.size + Number(normalizeGroup(name) === "magic rules");
      return rank(a) - rank(b) || collate.compare(a, b);
    }
    return Number(b === "Base class") - Number(a === "Base class") || collate.compare(a, b);
  }
  function number(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (!String(value).trim() || !/^\d+(?:\.\d+)?$/.test(String(value).trim())) return null;
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? result : null;
  }
  function level(entry) {
    const result = number(entry?.requiredLevel ?? entry?.level ?? entry?.minLevel ?? entry?.details?.lvl ?? entry?.details?.level);
    return result ?? (/\bcantrips?\b/i.test(entry?.group || "") ? 0 : null);
  }
  function challenge(entry) {
    const value = entry?.details?.cr ?? entry?.cr;
    const fraction = typeof value === "string" && value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) return Number(fraction[2]) ? Number(fraction[1])/Number(fraction[2]) : null;
    return number(value);
  }
  function compare(a, b, mode="name") {
    if (mode === "magic-asc") {
      const rank = entry => {
        const index = magicClasses.indexOf(magicClass(entry));
        return index < 0 ? magicClasses.length : index;
      };
      const difference = rank(a) - rank(b);
      if (difference) return difference;
      const left = level(a), right = level(b);
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      if (left !== null && right !== null && left !== right) return left - right;
    }
    const read = mode.startsWith("level-") ? level : mode.startsWith("challenge-") ? challenge : null;
    if (read) {
      const left=read(a),right=read(b);
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      if (left !== null && right !== null && left !== right) return (left-right)*(mode.endsWith("-desc")?-1:1);
      if (left===0 && right===0 && mode.startsWith("level-")) {
        const tier = entry => ({minor:1,major:2,greater:3}[entry?.group?.match(/^(minor|major|greater) hexes$/i)?.[1]?.toLowerCase()] || 0);
        if (tier(a)!==tier(b)) return (tier(a)-tier(b))*(mode.endsWith("-desc")?-1:1);
      }
    }
    return collate.compare(a?.name || "",b?.name || "") || collate.compare(a?.group || "",b?.group || "");
  }
  globalThis.EntryOrder = Object.freeze({level,challenge,compare,compareGroups,magicClass,magicClasses});
})();
