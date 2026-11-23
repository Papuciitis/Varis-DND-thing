"""Rebuild every campaign creature from the sanitized Chronica export.

The export stores ability MODIFIERS, not scores. No exact score is invented.
Reviewed replacements live separately in source/chronica-fills.json.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from html import unescape
from html.parser import HTMLParser
import json
from fractions import Fraction
from pathlib import Path
import re

import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/monsters/source/chronica-monsters.json"
FILLS = ROOT / "data/monsters/source/chronica-fills.json"
SRD = "https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf"
BASIC = "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/"
ABILITY_IDS = dict(zip(("str", "dex", "con", "int", "wis", "cha"), range(98557, 98563)))
ATTACK_IDS = (98590, 98589, 98588, 98587)
FEATURE_IDS = tuple(range(98651, 98645, -1))
DEFENSE_IDS = {98591: "immunities", 98592: "resistances", 98593: "vulnerabilities"}


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "p", "li", "tr", "div"):
            self.parts.append("\n")
        elif tag in ("td", "th"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("p", "li", "tr", "div"):
            self.parts.append("\n")


def plain_html(value):
    parser = PlainHTML()
    parser.feed(str(value or ""))
    text = unescape("".join(parser.parts)).replace("\xa0", " ").replace("\u202f", " ")
    return "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines() if line.strip())


def current_text(value):
    """Use named conditions that actually exist in Vara and strike-based riders."""
    text = plain_html(value)
    text = re.sub(r"\bexhaustion\b", "Fatigue", text, flags=re.I)
    text = re.sub(r"\bfrightened\b", "Afraid", text, flags=re.I)
    text = re.sub(r"\brestrained\b", "Pinned", text, flags=re.I)
    text = re.sub(r"\bHit Dice\b", "rest dice", text, flags=re.I)
    text = re.sub(r"\bHit:\s*", "Unblocked strike: ", text, flags=re.I)
    # Only damage/rider wording changes, not unrelated triggers such as taking a hit.
    text = re.sub(r"\bthen hits (it|the target|a creature)\b", r"then lands an unblocked strike against \1", text, flags=re.I)
    text = re.sub(r"\bafter you hit a creature\b", "after you land an unblocked strike against a creature", text, flags=re.I)
    text = re.sub(r"\bwhen hitting with claws\b", "on an unblocked claw strike", text, flags=re.I)
    text = re.sub(r"\bwhen it hits a target with a weapon attack\b", "when it lands an unblocked weapon strike against a target", text, flags=re.I)
    return text


SPELL_MAP = {
    "fire bolt": "minor pyromancy", "burning hands": "Cone of fire", "flaming sphere": "Fire flask",
    "sacred flame": "Purifying fire", "inflict wounds": "Harm", "cure wounds": "Heal",
    "create food and water": "Feast", "thorn whip": "Claws", "poison spray": "Corrode",
    "ray of sickness": "Acid bolt", "cloud of daggers": "Dagger swarm", "enlarge/reduce": "Power word: Grow",
    "hold person": "Lock and chain", "hold monster": "Arcane chains", "control flames": "minor pyromancy",
    "sudden awakening": "Innervate", "blight": "Wither", "contagion": "Bestow affliction",
    "darkness": "Darkness", "detect magic": "arcane eye", "dispel magic": "Dispel magic",
    "haste": "Accelerate", "invisibility": "Minor invisibility", "see invisibility": "Third eye",
    "cone of cold": "Direfrost", "confusion": "Enchant: Madness", "finger of death": "Power word: Perish",
    "plane shift": "Ethereal gate", "arcane hand": "Telekinesis", "greater invisibility": "Minor invisibility",
    "elemental bane": "Arcane enervation", "nondetection": "Concealment rune", "speak with dead": "Question evil",
    "teleport": "Waypoint", "mislead": "Illusory decoy", "weird": "Power word: Nightmare",
    "druidcraft": "Adapt", "produce flame": "minor pyromancy", "shillelagh": "Claws",
    "entangle": "Command nature", "longstrider": "Wind dash", "speak with animals": "Commune with nature",
    "thunderwave": "Zaaam", "animal messenger": "Animal companion", "barkskin": "Life shroud",
    "mage hand": "Minor telekinesis", "light": "minor pyromancy", "prestidigitation": "prestidigitation",
    "mage armor": "Aegis", "magic missile": "Arcane darts", "shield": "Shield",
    "misty step": "Transpose", "suggestion": "Charm", "counterspell": "counteract", "fireball": "Fireball",
    "fly": "Spirit wings", "ice storm": "Direfrost", "eldritch blast": "Eldritch blast",
    "animate dead": "Raise zombies", "create undead": "Create greater undead", "circle of death": "Necrotic pulse",
}


def spell_catalog(data_dir):
    catalog = {}
    for path in sorted(data_dir.rglob("*.yaml")):
        if "monsters" in path.parts:
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if path.relative_to(data_dir).as_posix() == "spells/arcane_cantrips.yaml":
            entries = data
        elif isinstance(data, dict) and data.get("section") == "spells":
            entries = data.get("entries", [])
        else:
            continue
        for entry in entries:
            if isinstance(entry, dict) and "name" in entry:
                catalog[entry["name"].casefold()] = (entry, path.relative_to(data_dir).as_posix())
    return catalog


def spell_refs(text, catalog):
    refs = []
    # Longest names first avoids interpreting 'invisibility' inside 'greater invisibility'.
    work = text.casefold()
    for old in sorted(SPELL_MAP, key=len, reverse=True):
        if not re.search(r"(?<![\w])" + re.escape(old) + r"(?![\w])", work):
            continue
        replacement = SPELL_MAP[old]
        record = catalog.get(replacement.casefold())
        if record is None and old == "thunderwave":
            record = next((v for k, v in catalog.items() if re.fullmatch(r"za+m", k)), None)
        if record is None:
            raise ValueError(f"Missing current spell substitute: {old} -> {replacement}")
        entry, source = record
        refs.append({"source_spell": old, "name": entry["name"], "group": entry.get("group", "Arcane cantrips"),
                     "source": source, "rule": "Use the current compendium entry's casting time, range, level, components and effects. Printed monster attack/save modifiers still apply."})
        work = re.sub(r"(?<![\w])" + re.escape(old) + r"(?![\w])", " ", work)
    return refs


def number(value, default=0):
    match = re.fullmatch(r"[+-]?\d+", str(value).strip())
    return int(match[0]) if match else default


def fields(entity):
    return {int(k): [str(x).strip() for x in values] for k, values in entity["stats"].items()}


def nonempty(values):
    return [v for v in values if v.strip() and v.casefold() not in ("none", "false")]


def first(stats, key):
    return next(iter(nonempty(stats.get(key, []))), "")


def ability_text(modifier):
    value = number(modifier)
    # Two scores share each modifier; the source does not say which was rolled.
    return f"{value:+d} modifier (score not recorded)"


def source_attack(row):
    name, attack, distance, damage, kind = (row + [""] * 5)[:5]
    text = []
    bonus = re.match(r"^([+-]\d+)", attack)
    save_only = not bonus and bool(re.search(r"DC|DEX|CON|WIS|STR", attack, re.I))
    # A breath is a saving-throw effect even where the source mistakenly repeats an attack bonus.
    if "breath" in name.casefold():
        save_only = True
        bonus = None
    if bonus:
        text.append(f"Attack {bonus[1]} to hit; Block DC {8 + int(bonus[1])}.")
        if attack != bonus[1]:
            text.append("Additional save: " + attack[len(bonus[1]):].strip(" ()") + ".")
    elif attack:
        text.append("Saving throw/effect: " + attack + "." if save_only else attack + ".")
    if distance:
        text.append("Reach/range: " + distance + ".")
    if damage or kind:
        text.append(("Unblocked strike: " if bonus else "Effect: ") + " ".join(x for x in (damage, kind) if x) + ".")
    if save_only:
        text.append("This saving-throw effect cannot be Blocked.")
    return {"name": name, "description": current_text(" ".join(text))}


def current_spell_rule(reference, catalog):
    record, _ = catalog[reference["name"].casefold()]
    parts = []
    for key in ("casting", "casting_time", "range", "duration", "components", "cost"):
        if record.get(key):
            value = record[key]
            parts.append(key.replace("_", " ").capitalize() + ": " + (", ".join(map(str, value)) if isinstance(value, list) else str(value)) + ".")
    for key in ("effect", "description", "desc"):
        if record.get(key):
            parts.append(current_text(record[key]))
    if not parts:
        raise ValueError("Replacement spell has no playable rule: " + reference["name"])
    return "\n\n".join(parts)


def spell_save_dc(text):
    found = re.search(r"\bDC\s*(?:STR|DEX|CON|WIS|INT|CHA)?\s*(\d+)|\b(?:STR|DEX|CON|WIS|INT|CHA)\s*\(?\s*(\d+)", text, re.I)
    return int(next(x for x in found.groups() if x)) if found else None


def caster_numbers(stats, casting=None):
    casting = casting or {}
    attacks, saves = [], []
    for sid in ATTACK_IDS:
        row = stats.get(sid, [])
        if not row:
            continue
        spell_name = re.sub(r"\s*\([^)]*\)", "", row[0]).strip().casefold()
        if spell_name not in SPELL_MAP:
            continue
        if len(row) > 1 and re.match(r"^[+-]\d+", row[1]):
            attacks.append(int(re.match(r"^[+-]\d+", row[1])[0]))
        save = spell_save_dc(" ".join(row[1:]))
        if save is not None:
            saves.append(save)
    for sid in FEATURE_IDS:
        row = stats.get(sid, [])
        if row and "spellcasting" in row[0].casefold():
            text = " ".join(row[1:])
            hit = re.search(r"([+-]\d+)\s*to hit", text)
            if hit:
                attacks.append(int(hit[1]))
            save = spell_save_dc(text)
            if save is not None:
                saves.append(save)
    if casting.get("attack_bonus"):
        attacks.append(number(casting["attack_bonus"]))
    if casting.get("save_dc"):
        saves.append(number(casting["save_dc"]))
    attack = max(attacks) if attacks else (max(saves) - 8 if saves else None)
    save = max(saves) if saves else (attack + 8 if attack is not None else None)
    return attack, save


def feature(row):
    description = current_text(" ".join(row[1:]))
    if not description and re.fullmatch(r"Blindsight\s+\d+\s*ft", row[0], re.I):
        description = "Perceives its surroundings within the printed radius without relying on sight (existing SRD blindsight sense)."
    return {"name": row[0], "description": description}


def convert(entity, fills, reviews, catalog):
    name = entity["name"]
    stats = fields(entity)
    description = plain_html(entity.get("description", ""))
    notes = plain_html(entity.get("notes", ""))
    entry = {"name": name, "group": "Chronica · " + entity["folder"], "id": f"chronica-{entity['id']}",
             "meta": entity.get("type", ""),
             "ac": first(stats, 98564), "hp": first(stats, 98563), "speed": first(stats, 98565),
             "abilities": {key: ability_text(first(stats, sid)) for key, sid in ABILITY_IDS.items() if first(stats, sid)},
             "traits": [feature(stats[sid]) for sid in FEATURE_IDS if nonempty(stats.get(sid, []))],
             "actions": [source_attack(stats[sid]) for sid in ATTACK_IDS if nonempty(stats.get(sid, []))],
             "conversion_notes": [
                 "Converted to Vara Block, unblocked-strike riders, current named conditions and current spell references. AC, HP and attack modifiers remain the campaign creature's fixed statistics; no equipment is inferred from AC alone.",
                 "Chronica stores six ability modifiers, not ability scores. A printed '+2 modifier' remains +2; an exact score has not been invented. All condition names use data/conditions.yaml: 5e frightened becomes Afraid, restrained becomes Pinned, exhaustion becomes Fatigue. Source durations, DCs and escape methods remain in force.",
                 "Short rest takes one day and long rest takes one week by default. Printed per-day uses remain per-day. Recharge X–Y is a d6 roll at the start of the creature's turn.",
             ],
             "source_ref": f"Chronica Tales of Custead pt.2 / {entity['folder']} / entity {entity['id']}",
             "original_5e": {"description": description, "notes": notes, "stats": deepcopy(entity["stats"])} }
    if description:
        entry["description"] = current_text(description)
    if notes:
        entry["additional_rules"] = current_text(notes)
    for sid, field in DEFENSE_IDS.items():
        if first(stats, sid):
            entry[field] = current_text("; ".join(nonempty(stats[sid])))
    if nonempty(stats.get(98645, [])):
        saves = nonempty(stats[98645])
        entry["saving_throws"] = "; ".join(saves) if any(re.search(r"[A-Za-z]", v) for v in saves) else "; ".join(f"{key.upper()} {value}" for key, value in zip(ABILITY_IDS, stats[98645]) if value)
    for sid, field in ((98582, "height"), (98583, "weight")):
        if first(stats, sid):
            entry[field] = first(stats, sid)
    match = re.search(r"\b(?:Challenge|CR)\s*:?\s*(\d+(?:/\d+)?)", description + "\n" + notes, re.I)
    if match:
        entry["cr"] = match[1]
    fill = fills.get(name)
    if fill:
        for key, value in fill["fields"].items():
            if not entry.get(key):
                entry[key] = deepcopy(value)
        entry["fallback_reference"] = {key: fill[key] for key in ("baseline", "source", "reason")}
        entry["conversion_notes"].append("Existing alternative: " + fill["reason"] + " Source: " + fill["source"])
        for key in ("traits", "actions", "bonus_actions", "reactions"):
            for row in entry.get(key, []):
                row["description"] = current_text(row.get("description", ""))
                if key == "actions" and "Block DC" not in row["description"]:
                    hit = re.search(r"([+-]\d+) to hit", row["description"])
                    if hit:
                        row["description"] = f"Block DC {8 + int(hit[1])}. " + row["description"]
    review = reviews.get(name, {})
    for field in ("traits", "actions", "bonus_actions", "reactions"):
        replacements = review.get(field, {})
        for row in entry.get(field, []):
            if row["name"] in replacements:
                row.update(deepcopy(replacements[row["name"]]))
        entry.setdefault(field, []).extend(deepcopy(review.get("add_" + field, [])))
    for field, value in review.get("fields", {}).items():
        entry[field] = deepcopy(value)
    entry["conversion_notes"].extend(review.get("notes", []))
    if review.get("sources"):
        entry["replacement_sources"] = review["sources"]
    # Compute DEX-only natural Block without inventing armor training/equipment.
    dex = first(stats, 98558)
    modifier = number(dex) if dex else (number(entry["abilities"].get("dex", "10"), 10) - 10) // 2
    entry["block"] = f"{max(0, modifier)} pool / {modifier:+d} check"
    if fill and not review.get("block"):
        # Only actual published armor named in a fallback is training evidence.
        # AC by itself never implies equipment or a proficiency bonus.
        armor = str(fill["fields"].get("ac", "")).casefold()
        armor_name, armor_block, protection, heavy = "", 0, 0, False
        if "plate)" in armor:
            armor_name, armor_block, protection, heavy = "Plated armor suit", 2, 3, True
        elif "chain shirt" in armor:
            armor_name, armor_block, heavy = "Chain shirt", 1, True
        elif "leather" in armor or "hide armor" in armor:
            armor_name = "Leather armor"
        if armor_name:
            proficiency = 2 + max(0, (int(Fraction(str(entry.get("cr", "0")))) - 1) // 4)
            strength = number(first(stats, 98557)) if first(stats, 98557) else (number(entry["abilities"].get("str", "10"), 10) - 10) // 2
            check = (max(strength, modifier) if heavy else modifier) + proficiency + protection
            entry["block"] = f"{max(0, modifier) + armor_block} pool / {check:+d} check; armor floor {armor_block}"
            entry["armor_reference"] = f"Existing Vara {armor_name}; armor Block {armor_block}, Protection {protection}. Training is evidenced by the named published armor. Fixed source AC/speed are retained as creature statistics."
    entry["block_rules"] = "Spend 1 Block after an attack hits, before damage. On a successful check against its Block DC, negate blockable damage and unblocked-strike effects. Natural armor alone grants no training or extra Block. Saving-throw-only effects cannot be Blocked."
    casting_abilities = {
        "Fiend Follower": "cha", "Camelfolk female sorcerer - Papaya": "cha",
        "Loxodon male cleric - Chandruuv": "wis", "The Ondonti male druid/cleric": "wis",
        "The Half-Orc Female sorcerer leader": "cha", "Imp": "cha",
        "Nightcrawler": "cha", "Nightshade Zombie": "con", "Atropal": "wis",
    }
    if name in casting_abilities:
        casting_ability = casting_abilities[name]
        entry["casting_ability"] = casting_ability.upper() + " " + first(stats, ABILITY_IDS[casting_ability])
    if review.get("block"):
        entry["block"] = review["block"]
    if fill and fill["fields"].get("spellcasting"):
        entry["spellcasting"] = fill["fields"]["spellcasting"]
    # Ordinary words such as light/fly/shield in anatomy and traits are not spells.
    spell_text = [json.dumps(entry.get("spellcasting", {}))]
    named_spells = set()
    for row in entry.get("traits", []) + entry.get("actions", []):
        spell_name = re.sub(r"\s*\([^)]*\)", "", row["name"]).strip().casefold()
        if spell_name in SPELL_MAP:
            spell_text.append(spell_name)
            named_spells.add(row["name"])
        elif re.search(r"(?:innate )?spellcasting", row["name"], re.I):
            spell_text.append(row.get("description", ""))
    if re.search(r"can cast the following|At will:|\d+/day:", notes, re.I):
        # Some records put senses BEFORE the casting list, others after it.
        spell_text.append(notes)
    refs = spell_refs("\n".join(spell_text), catalog)
    if refs:
        by_source = {row["source_spell"]: row for row in refs}
        default_attack, default_save = caster_numbers(stats, entry.get("spellcasting"))
        if default_attack is not None:
            entry["spell_attack"] = f"{default_attack:+d}"
        if default_save is not None:
            entry["spell_save_dc"] = default_save
        for row in refs:
            record, _ = catalog[row["name"].casefold()]
            row["level"] = str(record.get("lvl", "0"))
            row["current_rule"] = current_spell_rule(row, catalog)
        # Put converted spell rules in the playable feature itself, keeping the
        # original ranges/dice solely in original_5e for comparison.
        for field in ("traits", "actions", "bonus_actions", "reactions"):
            for row in entry.get(field, []):
                spell_name = re.sub(r"\s*\([^)]*\)", "", row["name"]).strip().casefold()
                reference = by_source.get(spell_name)
                if not reference:
                    continue
                modifiers = []
                raw = next((stats[sid] for sid in (*ATTACK_IDS, *FEATURE_IDS) if stats.get(sid) and stats[sid][0] == row["name"]), [])
                hit = re.match(r"^[+-]\d+", raw[1]) if len(raw) > 1 else None
                attack_bonus = int(hit[0]) if hit else default_attack
                save_dc = spell_save_dc(" ".join(raw[1:])) if raw else None
                save_dc = save_dc if save_dc is not None else default_save
                if attack_bonus is not None:
                    modifiers.append(f"Monster spell attack {attack_bonus:+d}; ordinary Block DC {8 + attack_bonus}.")
                if save_dc is not None:
                    modifiers.append(f"Monster spell save DC {save_dc}.")
                if reference["name"] == "Dagger swarm" and attack_bonus is not None:
                    ability = casting_abilities.get(name)
                    casting_mod = number(first(stats, ABILITY_IDS[ability])) if ability else 0
                    modifiers.append(f"Use the current ordinary Dagger (data/weapons.yaml): 1d4 piercing. With this spell's +1 weapon bonus and recorded casting modifier {casting_mod:+d}, each dagger attacks at {attack_bonus+1:+d}, deals 1d4{casting_mod+1:+d} piercing, and has Block DC {9+attack_bonus}. The surround save is DC {save_dc}.")
                row["description"] = ("Existing Vara alternative: " + reference["name"] + " (" + reference["group"] + ").\n\n" + reference["current_rule"]
                    + "\n\n" + " ".join(modifiers) + " Use the printed monster casting-ability modifier. Ordinary attack damage and riders require an unblocked strike; the spell's explicit exceptions take priority (including unblockable Harm damage and Acid bolt's on-hit ongoing acid). Saving-throw-only effects cannot be Blocked. A printed (Nx) is a source use limit, not extra castings in one action.")
        if entry.get("spellcasting"):
            original_casting = deepcopy(entry["spellcasting"])
            mapped = deepcopy(original_casting)
            mapped["cantrips"] = list(dict.fromkeys(by_source.get(name.casefold(), {}).get("name", name) for name in original_casting.get("cantrips", [])))
            prepared = {}
            for names in original_casting.get("spells", {}).values():
                for name in names:
                    reference = by_source.get(name.casefold())
                    if not reference:
                        raise ValueError("No current spell alternative for " + name)
                    prepared.setdefault(reference["level"], [])
                    if reference["name"] not in prepared[reference["level"]]:
                        prepared[reference["level"]].append(reference["name"])
            mapped["spells"] = prepared
            mapped["rules"] = "Use the current spell rules and levels below. Spend a listed slot at least as high as the replacement spell's level; an at-will replacement remains at will. Slots and source use limits are NPC resources, not an assertion that this stand-in uses the Vara player class's progression."
            entry["source_spellcasting"] = original_casting
            entry["spellcasting"] = mapped
        entry["spell_references"] = refs
        entry["conversion_notes"].append("Spell references below select existing Vara alternatives. Their current printed spell rules take priority over imported 5e spell prose, ranges, damage, levels and durations. Retain printed monster use limits and attack/save modifiers; cast alternatives at their printed level rather than obsolete 7th–9th-level upcasts.")
        if entry.get("additional_rules"):
            active_notes = entry["additional_rules"]
            if any(row["name"] == "Release Soul" for row in entry.get("actions", [])):
                active_notes = active_notes.split("Release Soul.")[0].strip()
            if entry.get("legendary_actions"):
                active_notes = re.split(r"LEGENDARY ACTIONS", active_notes, flags=re.I)[0].strip()
            for reference in sorted(refs, key=lambda item: len(item["source_spell"]), reverse=True):
                active_notes = re.sub(r"(?<![\w])" + re.escape(reference["source_spell"]) + r"(?![\w])", lambda _: reference["name"], active_notes, flags=re.I)
            active_notes = re.sub(r"as (?:a|an) [7-9](?:st|nd|rd|th)-level spell", "at the replacement's printed level", active_notes, flags=re.I)
            entry["additional_rules"] = active_notes
    # A source '2x' is meaningful: make the source count visible without inventing a mixed attack sequence.
    repeated = [row["name"] for row in entry["actions"] if row["name"] not in named_spells and re.search(r"\([2-9]x\)", row["name"], re.I)]
    if repeated:
        entry["multiattack"] = "The source permits repeated physical attacks: " + ", ".join(repeated) + ". Each listed physical (Nx) option uses its printed number of attacks as one Attack action. Other attacks are alternatives unless a separate Multiattack rule specifies a combination. A spell's (Nx) is its use count, not multiple castings in an action."
    limited = [row["name"] for row in entry["actions"] if row["name"] in named_spells and re.search(r"\(\d+x\)", row["name"], re.I)]
    if limited:
        entry["limited_spell_uses"] = "; ".join(limited) + ". Each activation uses the current replacement spell's casting time and spends one printed use. These are separate source use pools, not spell slots."
    return {k: v for k, v in entry.items() if v not in ("", [], {})}


def build(source=SOURCE, fills=FILLS, output=None):
    source_data = json.loads(Path(source).read_text(encoding="utf-8"))
    reviewed = json.loads((ROOT / "data/monsters/source/chronica-review.json").read_text(encoding="utf-8"))
    replacements = json.loads(Path(fills).read_text(encoding="utf-8"))
    catalog = spell_catalog(ROOT / "data")
    entries = [convert(entity, replacements, reviewed, catalog) for entity in source_data["monsters"]]
    if len({entry["id"] for entry in entries}) != len(entries):
        raise ValueError("Duplicate Chronica entity ID")
    document = {"section": "monsters", "entries": entries}
    if output:
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        Path(output).write_text(yaml.safe_dump(document, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8")
    return document


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=ROOT / "data/monsters/chronica.yaml")
    args = parser.parse_args()
    result = build(args.source, output=args.output)
    print(f"Converted {len(result['entries'])} Chronica creatures")
