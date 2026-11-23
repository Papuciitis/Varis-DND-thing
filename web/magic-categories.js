"use strict";

// Categories describe an item's use; rarity and the original item type stay separate.
(() => {
  const categories = Object.freeze([
    {key:"weapons",title:"Weapons & ammunition"},
    {key:"armor-shields",title:"Armor & shields"},
    {key:"wearables",title:"Wearables & jewelry"},
    {key:"spellcasting",title:"Staves, wands & rods"},
    {key:"scrolls",title:"Scrolls"},
    {key:"consumables",title:"Potions & consumables"},
    {key:"misc",title:"Miscellaneous"}
  ].map(Object.freeze));
  const text = value => typeof value === "string" ? value.trim().toLowerCase() : "";
  const aliases = {
    weapons:"weapon weapons ammunition ammo",
    "armor-shields":"armor armour shield shields",
    wearables:"wearable wearables jewelry jewellery clothing accessories",
    spellcasting:"spellcasting staff staves wand wands rod rods",
    scrolls:"scroll scrolls",
    consumables:"potion potions consumable consumables elixir elixirs",
    misc:"misc miscellaneous wondrous"
  };

  function category(entry) {
    const details=entry?.details || {};
    const explicit=text(details.category);
    const selected=categories.find(item=>item.key===explicit || text(item.title)===explicit);
    if (selected) return selected.key;

    const type=text(details.type);
    if (/\b(?:weapons?|ammunition)\b/.test(type)) return "weapons";
    if (/\b(?:armou?r|shields?)\b/.test(type)) return "armor-shields";
    if (/\b(?:scrolls?)\b/.test(type)) return "scrolls";
    if (/\b(?:potions?|consumables?|elixirs?|poisons?)\b/.test(type)) return "consumables";
    if (/\b(?:staff|staves|wands?|rods?)\b/.test(type)) return "spellcasting";
    if (/\b(?:wearables?|jewel(?:ry|lery)|rings?|cloaks?|robes?|amulets?|boots?|gloves?)\b/.test(type)) return "wearables";
    if (["simple","martial"].includes(type) && details.damage) return "weapons";

    const base=text(details.base_item);
    const name=text(entry?.name);
    const armor=/\b(?:armou?r|shields?|breastplate|half[ -]?plate|plate mail|chain mail)\b/;
    const weapon=/\b(?:swords?|longswords?|shortswords?|greatswords?|rapiers?|scimitars?|daggers?|knife|knives|axes?|greataxes?|handaxes?|bows?|longbows?|shortbows?|crossbows?|spears?|pikes?|halberds?|glaives?|javelins?|quarterstaff|quarterstaves|hammers?|warhammers?|maces?|clubs?|flails?|whips?|slings?|arrows?|bolts?|bullets?|darts?|rifles?|pistols?|guns?)\b/;
    if (armor.test(base)) return "armor-shields";
    if (weapon.test(base)) return "weapons";
    if (/\bscrolls?\b/.test(name)) return "scrolls";
    if (/\b(?:potions?|elixirs?|philters?|tonics?|ointments?)\b/.test(name)) return "consumables";
    if (armor.test(name)) return "armor-shields";
    if (/\b(?:staff|staves|wands?|rods?)\b/.test(name)) return "spellcasting";
    if (/\b(?:rings?|cloaks?|capes?|robes?|hats?|helms?|helmets?|boots?|shoes?|sandals?|slippers?|gloves?|gauntlets?|bracers?|belts?|amulets?|necklaces?|pendants?|goggles?|masks?|circlets?|crowns?|brooches|earrings?)\b/.test(name)) return "wearables";
    if (weapon.test(name)) return "weapons";
    return "misc";
  }

  function categoriesFor(entries) {
    const groups=categories.map(item=>({...item,count:0,entries:[]}));
    const byKey=new Map(groups.map(item=>[item.key,item]));
    for (const entry of Array.isArray(entries) ? entries : []) {
      const group=byKey.get(category(entry));
      group.entries.push(entry);
      group.count++;
    }
    return groups.filter(item=>item.count);
  }

  function searchTerms(entry) {
    const key=category(entry);
    return categories.find(item=>item.key===key).title + " " + aliases[key];
  }

  globalThis.MagicCategories=Object.freeze({categories,category,categoriesFor,searchTerms});
})();
