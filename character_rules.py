"""Conservative character-builder metadata derived from the compiled house rules.

Rule prose remains attached to every feature. This module recognizes source
structure and explicit selections; it does not guess numerical effects from prose.
"""

import json
import re


ABILITIES = ("str", "dex", "con", "int", "wis", "cha")
ABILITY_NAMES = dict(zip(ABILITIES, ("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma")))
ABILITY_PATTERN = re.compile(r"\b(?:" + "|".join((*ABILITIES, *ABILITY_NAMES.values())) + r")\b", re.I)
COUNTS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "a": 1, "an": 1}
COUNT_PATTERN = r"(?:\d+|one|two|three|four|five|six|an?)"
SKILLS = ("Athletics", "Stamina", "Acrobatics", "Sleight of Hand", "Stealth", "Instinct", "Arcana", "History",
          "Investigation", "Nature", "Religion", "Mechanism", "Animal Handling", "Insight", "Medicine", "Perception",
          "Survival", "Deception", "Intimidation", "Performance", "Persuasion")


def _id(*parts):
    return json.dumps(list(parts), ensure_ascii=False, separators=(",", ":"))


def _number(text):
    return int(text) if text.isdigit() else COUNTS.get(text.lower(), 1)


def _abilities(text):
    found = []
    for match in ABILITY_PATTERN.finditer(text):
        word = match.group().lower()
        code = next((code for code, name in ABILITY_NAMES.items() if word in (code, name)), None)
        if code not in found:
            found.append(code)
    return found


def _text(value):
    """Read introductory prose only, rather than child-option rules."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "\n".join(str(value[key]) for key in ("desc", "description") if key in value)
    return ""


def _bonus_mode(text):
    amount = re.search(r"[+\-−]\s*\d+", text)
    if not amount:
        return None
    amount = int(amount.group().replace("−", "-").replace(" ", ""))
    non = re.search(r"\bnon[- ](str|dex|con|int|wis|cha)\b", text, re.I)
    options = _abilities(text)
    if non:
        options = [code for code in ABILITIES if code != non.group(1).lower()]
    elif not options:
        options = list(ABILITIES)
    count = re.search(r"\b(" + COUNT_PATTERN + r")\s+(?:non[- ]\w+\s+)?ability scores?", text, re.I)
    count = _number(count.group(1)) if count else 1
    return {"count": count, "amount": amount, "options": options,
            "repeat": bool(re.search(r"any combination", text, re.I)), "label": text.strip()}


def _race_bonuses(entry_id, raw):
    fixed, choices = {}, []
    for index, text in enumerate(raw if isinstance(raw, list) else [raw]):
        if not isinstance(text, str):
            continue
        # Only an 'or' followed by a new signed allocation starts an alternative.
        pieces = re.split(r"\s*,?\s+or\s+(?=[+\-−]\s*\d)", text, flags=re.I)
        modes = [mode for piece in pieces if (mode := _bonus_mode(piece))]
        if not modes:
            continue
        mode = modes[0]
        choice = len(mode["options"]) > 1 or len(modes) > 1 or bool(re.search(r"choice|one of", text, re.I))
        if not choice:
            code = mode["options"][0]
            fixed[code] = fixed.get(code, 0) + mode["amount"]
            continue
        mode = {"id": _id(entry_id, "ability", index), **mode}
        if len(modes) > 1:
            mode["alternatives"] = modes[1:]
        choices.append(mode)
    return fixed, choices


def _choice_count(text):
    text = re.split(r"(?m)^\s*\*\s", text, maxsplit=1)[0]
    match = re.search(r"\b(?:choose|pick)\s+(?:any\s+)?(" + COUNT_PATTERN + r")\b", text, re.I)
    if not match:
        match = re.search(r"\b(?:gain|learn)\s+(" + COUNT_PATTERN + r")\s+(?:upgrades?|abilities)\s+from\b", text, re.I)
    return _number(match.group(1)) if match else None


def _option_name(text):
    return re.split(r"\s+(?:-|—|–)\s+", text.strip(), maxsplit=1)[0].strip()


def _options(raw):
    if isinstance(raw, dict):
        return list(raw.items())
    if isinstance(raw, list):
        result = []
        for item in raw:
            if isinstance(item, dict):
                result.extend(item.items())
            elif isinstance(item, str):
                result.append((_option_name(item), item))
        return result
    return []


def _named_options(group_id, options):
    occurrences = {}
    result = []
    for name, value in options:
        occurrence = occurrences.get(name, 0)
        occurrences[name] = occurrence + 1
        result.append({"id": _id(group_id, name, occurrence), "name": name, "details": value})
    return result


def _bullet_options(text):
    """Keep nested prerequisites in the parent's details instead of flattening."""
    lines = text.splitlines()
    bullets = [(index, len(match.group(1)), match.group(2)) for index, line in enumerate(lines)
               if (match := re.match(r"^(\s*)\*\s+(.*)", line))]
    if not bullets:
        return []
    indent = min(item[1] for item in bullets)
    top = [item for item in bullets if item[1] == indent]
    # Some source circles use consecutive '* The Fox' heading bullets with
    # their named benefits at the same indentation. Preserve that grouping.
    headings = [item for item in top if re.fullmatch(r"The [^.!?:]+", item[2])
                and not re.search(r"\s+(?:-|—|–)\s+", item[2])]
    if headings and headings[0] == top[0]:
        return [(content.strip(), "\n".join(lines[index:(headings[offset + 1][0]
                 if offset + 1 < len(headings) else len(lines))]).rstrip())
                for offset, (index, _, content) in enumerate(headings)]
    result = []
    for offset, (index, _, content) in enumerate(top):
        # Plain effect bullet lists are prose, not named character options.
        if not re.search(r"\s+(?:-|—|–)\s+", content):
            continue
        end = top[offset + 1][0] if offset + 1 < len(top) else len(lines)
        details = "\n".join([content, *lines[index + 1:end]]).rstrip()
        result.append((_option_name(content), details))
    return result


def _choices(feature_id, details):
    intro = _text(details)
    count = _choice_count(intro)
    if count is None:
        return []
    groups = []
    if isinstance(details, dict):
        for name, value in details.items():
            if name in ("desc", "description", "flavor", "name"):
                continue
            options = _options(value)
            if options:
                groups.append((name, options))
    elif isinstance(details, str):
        options = _bullet_options(details)
        if options:
            groups.append(("Choose features", options))
    result = []
    for label, options in groups:
        group_id = _id(feature_id, "choice", label)
        result.append({"id": group_id, "label": label, "count": count,
                       "options": _named_options(group_id, options)})
    return result


def _explicit_levels(heading, details):
    heading_level = re.search(r"(?:\blvl\s+|\blevel\s+)(\d+)\b", heading, re.I)
    if heading_level:
        return [int(heading_level.group(1))]
    # A grant's opening clause can list recurring levels. Do not read costs,
    # spell levels, examples, or child options as the feature's required level.
    intro = _text(details)[:600]
    matches = list(re.finditer(r"\b(?:at|upon reaching|starting at|beginning at|when you reach)\s+"
                      r"((?:\d+(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*,?\s*and\s+)?)+)"
                      r"(?:\s+[a-z-]+)?\s+levels?\b", intro, re.I))
    if matches:
        result = [int(number) for number in re.findall(r"\d+", matches[0].group(1))]
        if len(matches) > 1 and re.search(r"\bagain\b", intro[matches[0].end():matches[1].start()]):
            result.extend(int(number) for number in re.findall(r"\d+", matches[1].group(1)))
        return result
    return []


def _sections(details):
    if not isinstance(details, dict):
        return []
    result = []
    for item in details.get("sections", []):
        if isinstance(item, dict):
            result.append((item.get("heading", ""), item.get("body", ""), None))
    for heading, value in details.items():
        level = re.fullmatch(r"lvl\s+(\d+)", heading, re.I)
        if level and isinstance(value, dict):
            result.extend((name, body, int(level.group(1))) for name, body in value.items())
    return result


def _progression(details):
    for heading, body, _ in _sections(details):
        if "progression" not in heading.lower() or not isinstance(body, dict):
            continue
        columns = body.get("columns", [])
        rows = body.get("rows", [])
        if columns and str(columns[0]).lower() == "level":
            return [{"level": int(row[0]), "values": dict(zip(columns[1:], row[1:]))}
                    for row in rows if row and str(row[0]).isdigit()]
    return []


def _progression_levels(name, progression):
    needle = re.sub(r"[^a-z0-9]", "", name.lower())
    return [row["level"] for row in progression for key, value in row["values"].items()
            if key.lower() == "features" and any(
                re.sub(r"[^a-z0-9]", "", part.lower()) == needle for part in str(value).split(","))]


def _features(entry_id, details, progression=(), default_level=1):
    features = []
    sections = _sections(details)
    grouped = set()
    occurrences = {}
    for index, (name, body, nested_level) in enumerate(sections):
        if index in grouped:
            continue
        if isinstance(body, dict) and "columns" in body and "rows" in body:
            continue
        if re.search(r"proficienc|equipment|reference", name, re.I):
            continue
        occurrence = occurrences.get(name, 0)
        occurrences[name] = occurrence + 1
        explicit = _explicit_levels(name, body)
        if nested_level is not None:
            # A lvl N container grants the initial feature even when its prose
            # mentions only later upgrades (for example Occultist cantrips).
            explicit = sorted({nested_level, *explicit})
        table_levels = _progression_levels(name, progression)
        # Repeated level identities make each explicitly recurring grant selectable.
        levels = explicit or table_levels or [default_level]
        for level in levels:
            feature_id = _id(entry_id, "feature", name, occurrence, level)
            choices = _choices(feature_id, body)
            if name.lower() == "oath" and _choice_count(_text(body)):
                oaths = []
                for child_index in range(index + 1, len(sections)):
                    child_name, child_body, _ = sections[child_index]
                    if not child_name.lower().startswith("oath of "):
                        break
                    grouped.add(child_index)
                    oaths.append((child_name, child_body))
                if oaths:
                    choice_id = _id(feature_id, "choice", "Oaths")
                    choices.append({"id": choice_id, "label": "Oaths", "count": 1,
                                    "options": _named_options(choice_id, oaths)})
            features.append({"id": feature_id, "name": name, "level": level, "details": body,
                             "choices": choices,
                             "levelSource": "explicit" if explicit else "progression" if table_levels else "fallback"})
    return features


def _profile(details):
    parts = [value for key, value in details.items() if "proficienc" in key.lower() and isinstance(value, str)]
    parts.extend(body for name, body, _ in _sections(details) if "proficienc" in name.lower() and isinstance(body, str))
    fields = {}
    for line in "\n".join(parts).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fields[key.strip().lower()] = value.strip()
    die = re.search(r"\bd\d+\b", fields.get("hit dice", fields.get("hit die", "")), re.I)
    # The source writes 1d10; keep only its die size, with no HP formula.
    if not die:
        die = re.search(r"d\d+\b", fields.get("hit dice", fields.get("hit die", "")), re.I)
    skills = fields.get("skills", "")
    count = re.search(r"\b(" + COUNT_PATTERN + r")\b", skills, re.I)
    available = [skill for skill in SKILLS if re.search(r"\b" + re.escape(skill) + r"\b", skills, re.I)]
    if re.search(r"choose any", skills, re.I):
        available = list(SKILLS)
    return {"hitDie": die.group().lower() if die else "", "saves": _abilities(fields.get("saving throws", "")),
            "proficiencies": {"armor": fields.get("armor", fields.get("armor proficiencies", "")),
                              "weapons": fields.get("weapons", ""), "tools": fields.get("tools", "")},
            "skillChoice": {"count": _number(count.group(1)), "options": available} if count and available else None}


def _casting(features):
    result = []
    for feature in features:
        if not re.search(r"spellcasting|magical talent|cantrips", feature["name"], re.I):
            continue
        for sentence in re.split(r"[.\n]", _text(feature["details"])):
            if re.search(r"casting (?:attribute|modifier|ability score)", sentence, re.I):
                result.extend(code for code in _abilities(sentence) if code not in result)
    return result


def _casting_quantity(value):
    """A dash in a source capacity table denotes no slots, not an unknown rule."""
    if value is None:
        return None
    text = str(value).strip()
    if text in ("-", "—", "–"):
        return 0
    if text.isdigit():
        return int(text)
    raise ValueError(f"Unrecognized casting-table quantity {value!r}")


def _casting_metadata(name, details, progression, features):
    kinds = {"Wizard": ("arcane", "leveled"), "Sorcerer": ("arcane", "leveled"),
             "Druid": ("mystic", "leveled"), "Cleric": ("oath", "full"),
             "Occultist": ("occult", "occult"), "Bard": ("any", "rest-dice")}
    if name not in kinds:
        return None
    tradition, mode = kinds[name]
    sections = _sections(details)
    bodies = {heading: body for heading, body, _ in sections}
    result = {"tradition": tradition, "mode": mode, "progression": [], "slotLevelRule": None,
              "maxCastLevelRule": None, "startingSpellbook": None, "recovery": [],
              "pointResources": [], "modifiers": [], "warnings": [],
              "sourceHeadings": ["Class progression"] if progression else []}
    primary = {row["level"]: row["values"] for row in progression}
    table = next(((heading, body) for heading, body, _ in sections
                  if isinstance(body, dict) and any(re.fullmatch(r"Level \d+(?: slots)?", column, re.I)
                                                   for column in body.get("columns", []))), None)
    slot_rows = {}
    if table:
        heading, body = table
        result["sourceHeadings"].append(heading)
        slot_rows = {int(row[0]): dict(zip(body["columns"][1:], row[1:])) for row in body["rows"]}
    cantrip_grants = []
    if name == "Sorcerer":
        # Its initial cantrips and the recurring ASI cantrip are separate grants.
        cantrip_text = _text(bodies.get("Cantrips", ""))
        start = re.search(r"know (\d+) arcane cantrips", cantrip_text, re.I)
        if start:
            cantrip_grants.append((1, int(start.group(1))))
        for feature in features:
            if feature["name"].lower() == "ability score improvement" and re.search(
                    r"learn an extra cantrip", _text(feature["details"]), re.I):
                cantrip_grants.append((feature["level"], 1))
    occult_counts, occult_known, occult_cantrips = None, None, None
    if mode == "occult":
        spell_text = _text(bodies.get("Spellcasting", ""))
        slot_start = re.search(r"You have (\d+) occult slots", spell_text, re.I)
        increase = re.search(r"increases by (\d+).*?\(lvl ([\d, ]+)\)", spell_text, re.I)
        if not slot_start or not increase:
            raise ValueError("Occultist slot-count source is not recognized")
        occult_counts = (int(slot_start.group(1)), int(increase.group(1)),
                         [int(value) for value in re.findall(r"\d+", increase.group(2))])
        known_start = re.search(r"start with (" + COUNT_PATTERN + r") known occultist spells", spell_text, re.I)
        if known_start and re.search(r"learn a new spell every occultist level", spell_text, re.I):
            occult_known = _number(known_start.group(1))
        cantrip_text = _text(bodies.get("Cantrips", ""))
        cantrip_start = re.search(r"start with (\d+) occult cantrip", cantrip_text, re.I)
        if cantrip_start:
            occult_cantrips = (int(cantrip_start.group(1)), _explicit_levels("Cantrips", cantrip_text))
        result["slotLevelRule"] = {"basis": "characterLevel", "divisor": 2, "rounding": "up"}
        result["sourceHeadings"].extend(["lvl 1 / Spellcasting", "lvl 1 / Cantrips"])
    # The published house-rule progression ends at 12; prose-only Occultist uses
    # the same supported range, without extrapolating future class levels.
    levels = sorted(slot_rows or primary) or list(range(1, 13))
    for level in levels:
        values = {**primary.get(level, {}), **slot_rows.get(level, {})}
        slots = []
        for column, raw in slot_rows.get(level, {}).items():
            slot_level = re.fullmatch(r"Level (\d+)(?: slots)?", column, re.I)
            if slot_level:
                maximum = _casting_quantity(raw)
                if maximum:
                    slots.append({"level": int(slot_level.group(1)), "max": maximum})
        known = _casting_quantity(values.get("Spells known", values.get("Talent spells")))
        cantrips = _casting_quantity(values.get("Cantrips known", values.get("Cantrips")))
        count = _casting_quantity(values.get("Full Spell slots"))
        if name == "Sorcerer":
            cantrips = sum(amount for grant_level, amount in cantrip_grants if grant_level <= level)
        if occult_counts:
            start, amount, increases = occult_counts
            count = start + amount * sum(grant_level <= level for grant_level in increases)
            known = occult_known + level - 1 if occult_known is not None else None
            if occult_cantrips:
                start, increases = occult_cantrips
                cantrips = start + sum(grant_level <= level for grant_level in increases)
        result["progression"].append({"level": level, "slots": slots, "slotCount": count,
                                      "knownSpells": known, "cantrips": cantrips})
    recovery_names = {"Wizard": ("Arcane recovery",), "Sorcerer": ("Spellcasting",),
                      "Druid": ("Spellcasting and cantrips",), "Cleric": ("Spellcasting",),
                      "Occultist": ("Spellcasting", "Dark ritual"), "Bard": ()}[name]
    result["recovery"] = [{"name": heading, "details": bodies[heading]} for heading in recovery_names if heading in bodies]
    if name == "Wizard":
        result["sourceHeadings"].extend(["Spellcasting", "Cantrips"])
        text = _text(bodies.get("Spellcasting", ""))
        book = re.search(r"spell book with (\d+) level (\d+) spells", text, re.I)
        if book and re.search(r"equal to your intelligence bonus", text, re.I) and re.search(r"add 1 more arcane spell", text, re.I):
            result["startingSpellbook"] = {"base": int(book.group(1)), "ability": "int", "spellLevel": int(book.group(2)),
                                           "perAdditionalClassLevel": 1}
        result["warnings"].append("The Wizard source references a prepared-spell count but supplies no prepared-count column.")
    elif name == "Cleric":
        result["warnings"].append("Cleric full-slot counts are specified, but their numeric maximum slot level is not; set it manually from your table's ruling.")
    elif name == "Bard":
        result["sourceHeadings"].append("Magical talent")
        result["maxCastLevelRule"] = {"basis": "characterLevel", "divisor": 2, "rounding": "up"}
        result["warnings"].append("Bard spell learning is capped at half Bard level without a stated rounding rule; its casting cap explicitly rounds up.")
    elif name == "Sorcerer":
        result["sourceHeadings"].extend(["Cantrips", "Ability score improvement", "Metamagic"])
        text = _text(bodies.get("Metamagic", ""))
        if re.search(r"maximum number of metamagic points.*?charisma bonus \+ your proficiency bonus", text, re.I):
            result["pointResources"].append({"id": "metamagic", "name": "Metamagic points", "minLevel": min(_explicit_levels("Metamagic", text)),
                                              "capacity": {"ability": "cha", "proficiency": True},
                                              "recovery": [{"name": "Metamagic", "details": bodies["Metamagic"]}]})
    unmodeled = {"Wizard": "Other archetype pools, including arcane focus points and arcane essence dice, require separate tracking.",
                 "Sorcerer": "Separate archetype and innate-magic reserves, including Graymage, Evoker and dream spell slots, require manual tracking; only listed base-slot modifiers are included.",
                 "Druid": "Additional circle and archetype casting pools are not included in the base slot table.",
                 "Cleric": "Other archetype casting points, extra spells known and capacity reductions require manual tracking unless listed as modifiers.",
                 "Occultist": "Other archetype casting reserves and pending slot costs require manual tracking unless listed as modifiers.",
                 "Bard": "Feature and archetype casting reserves and increases to talent spells known require manual tracking."}
    result["warnings"].append(unmodeled[name])
    if name in ("Wizard", "Sorcerer", "Druid"):
        result["warnings"].append("The base source describes specific slot-recovery methods without stating a general full-slot reset on long rest.")
    result["sourceHeadings"] = list(dict.fromkeys([*result["sourceHeadings"], *recovery_names]))
    return result


def _casting_modifiers(result):
    """Attach reviewed capacity grants by the exact source feature/option ID."""
    classes = {item["name"]: item for item in result["classes"]}
    occultist = classes.get("Occultist")
    if occultist and occultist["casting"]:
        for feature in occultist["features"]:
            if feature["name"] != "Mark & reward":
                continue
            for group in feature["choices"]:
                for option in group["options"]:
                    if group["label"] == "Reward" and option["details"] == "+2 max occult slots.":
                        occultist["casting"]["modifiers"].append({"optionId": option["id"], "resource": "occultSlots", "amount": 2})
    for archetype in result["archetypes"]:
        parent = classes.get(archetype["className"])
        if not parent or not parent["casting"]:
            continue
        for feature in archetype["features"]:
            resource, slot_level = None, None
            text = _text(feature["details"])
            if archetype["name"] == "Court mage" and feature["name"] == "Extra spell slots" and "1 extra spell slot per every level of slot that you can cast" in text:
                resource = "eachSlotLevel"
            elif archetype["name"] == "Oathspeaker" and feature["name"] == "Extra spell slot" and "an extra full cleric spell slot" in text:
                resource = "fullSlots"
            elif archetype["name"] == "Wildmage" and re.fullmatch(r"Raw power (?:I|II|III|IV)", feature["name"]):
                match = re.search(r"an extra level (\d+) spell slot", text)
                if match:
                    resource, slot_level = "slot", int(match.group(1))
            if resource:
                modifier = {"featureId": feature["id"], "resource": resource, "amount": 1}
                if slot_level is not None:
                    modifier["level"] = slot_level
                parent["casting"]["modifiers"].append(modifier)


def _notes(details):
    return "\n".join(str(details[key]) for key in ("draft_note", "notes", "note") if details.get(key))


def _class(entry_id, entry):
    details = entry["details"]
    progression = _progression(details)
    features = _features(entry_id, details, progression)
    table_levels = [row["level"] for row in progression
                    if any("archetype" in str(value).lower() for key, value in row["values"].items() if key.lower() == "features")]
    prose_levels = sorted({feature["level"] for feature in features
                           if "archetype" in feature["name"].lower() and feature["levelSource"] == "explicit"})
    notes = _notes(details)
    warnings = [notes] if notes else []
    if table_levels and prose_levels and table_levels != prose_levels:
        warnings.append("Archetype levels differ between progression table and explicit feature prose; review the source.")
    for name in ("Ability score improvement",):
        table = _progression_levels(name, progression)
        prose = [feature["level"] for feature in features if feature["name"].lower() == name.lower()
                 and feature["levelSource"] == "explicit"]
        if table and prose and table != prose:
            warnings.append("Ability score improvement levels differ between progression table and feature prose; review the source.")
    return {"id": entry_id, "entryId": entry_id, "name": entry["name"], **_profile(details),
            "castingAbilities": _casting(features), "casting": _casting_metadata(entry["name"], details, progression, features),
            "archetypeLevels": table_levels or prose_levels,
            "progression": progression, "features": features, "description": details.get("description", details.get("Description", "")),
            "notes": notes, "warnings": warnings}


def _race(entry_id, entry):
    details = entry["details"]
    fixed, choices = _race_bonuses(entry_id, details.get("attribute_bonuses", []))
    traits = []
    occurrences = {}
    for trait in details.get("traits", []):
        name = trait.get("name", "")
        occurrence = occurrences.get(name, 0)
        occurrences[name] = occurrence + 1
        feature_id = _id(entry_id, "trait", name, occurrence)
        traits.append({"id": feature_id, "name": name, "level": 1, "details": trait,
                       "choices": _choices(feature_id, trait)})
    speed = re.search(r"\d+(?:\.\d+)?", str(details.get("speed", "")))
    return {"id": entry_id, "entryId": entry_id, "name": entry["name"], "description": details.get("description", ""),
            "speed": float(speed.group()) if speed else None, "size": str(details.get("size", "")).lower(),
            "abilityBonuses": fixed, "abilityChoices": choices, "traits": traits,
            "proficiencies": details.get("proficiencies", []), "notes": _notes(details)}


def compile_character_rules(sections):
    """Return portable, deterministic metadata using compendium entry identities."""
    result = {"races": [], "classes": [], "archetypes": []}
    archetypes = []
    for section in sections:
        for entry in section["entries"]:
            entry_id = _id(section["key"], entry["group"], entry["name"])
            if section["key"] == "races":
                result["races"].append(_race(entry_id, entry))
            elif section["key"] == "classes":
                if entry["group"] == "Base class":
                    result["classes"].append(_class(entry_id, entry))
                elif re.search(r" archetypes?$", entry["group"], re.I):
                    archetypes.append((entry_id, entry))
    classes = {item["name"].lower(): item for item in result["classes"]}
    for entry_id, entry in archetypes:
        parent_name = re.sub(r" archetypes?$", "", entry["group"], flags=re.I)
        parent = classes.get(parent_name.lower())
        if parent is None:
            raise ValueError(f"Archetype {entry['name']!r} has no base class {parent_name!r}")
        fallback = min(parent["archetypeLevels"], default=1)
        details = entry["details"]
        features = _features(entry_id, details, default_level=fallback)
        explicit = [feature["level"] for feature in features if feature["levelSource"] == "explicit"]
        notes = _notes(details)
        result["archetypes"].append({"id": entry_id, "entryId": entry_id, "name": entry["name"],
                                     "className": parent["name"], "minLevel": min(explicit) if explicit else fallback,
                                     "minLevelSource": "explicit" if explicit else "parent fallback", "features": features,
                                     "status": str(details.get("status", "")), "notes": notes,
                                     "description": details.get("description", ""),
                                     "warnings": [] if explicit else ["No explicit starting level; using the parent's earliest archetype level. Review source status."]})
    _casting_modifiers(result)
    return result
