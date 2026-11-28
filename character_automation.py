"""Validate declarative character mechanics without interpreting rule prose.

Declarations may be inline on a compendium entry or in character-automation.yaml.
The character compiler resolves their references after creating stable source IDs.
"""

from copy import deepcopy
import json


ABILITIES = {"str", "dex", "con", "int", "wis", "cha"}
TRADITIONS = {"arcane", "mystic", "oath", "occult"}
NUMERIC_EFFECTS = {
    "ac", "block", "combatBlock", "blockCheck", "dexBlock", "hpFlat", "hpPerLevel",
    "restDice", "speed", "initiative", "weaponAttack", "weaponDamage", "damage",
    "spellAttack", "spellSave", "deathSaveSlots", "deathSaveBonus", "knownSpells",
    "occultSlots", "fullSlots", "eachSlotLevel", "metamagicMaximum",
    "armorBulkReduction", "armorSlowReduction",
}
MAP_EFFECTS = {"abilities", "skills", "skillBonuses", "saveBonuses", "abilitySkillBonuses", "slots", "reductions"}
LIST_EFFECTS = {"resistances", "immunities", "languages"}
BOOLEAN_EFFECTS = {"offHandAbilityDamage"}
PROFICIENCIES = {"armor", "weapons", "tools", "languages"}
CHOICE_TYPES = {"select", "text", "ability", "skill", "spell", "upgrade-target"}


def obj(value, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a mapping")
    return value


def keys(value, allowed, label):
    obj(value, label)
    unexpected = value.keys() - set(allowed)
    if unexpected:
        raise ValueError(f"{label}: unsupported fields {', '.join(sorted(unexpected))}")


def text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be nonempty text")
    return value


def items(value, label):
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    return value


def number(value, label, minimum=-1000000, maximum=1000000):
    if isinstance(value, bool):
        raise ValueError(f"{label} must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be an integer") from None
    if str(result) != str(value) or not minimum <= result <= maximum:
        raise ValueError(f"{label} must be an integer from {minimum} to {maximum}")
    return result


def flag(value, label):
    if value is True or value == "true":
        return True
    if value is False or value == "false":
        return False
    raise ValueError(f"{label} must be true or false")


def condition(value, label):
    keys(value, {"all", "any", "not", "choice", "includes", "level", "basis", "ability", "minimum", "skill", "rank", "class"}, label)
    if "all" in value or "any" in value:
        if len(value) != 1:
            raise ValueError(f"{label}: all/any cannot mix with another condition")
        key = next(iter(value))
        rows = items(value[key], label)
        if not rows:
            raise ValueError(f"{label}: all/any conditions must not be empty")
        return {key: [condition(row, label + "." + key) for row in rows]}
    if "not" in value:
        if len(value) != 1:
            raise ValueError(f"{label}: not needs one condition")
        return {"not": condition(value["not"], label + ".not")}
    if "choice" in value:
        keys(value, {"choice", "includes"}, label)
        return {"choice": text(value["choice"], label), "includes": text(value.get("includes"), label)}
    if "class" in value:
        keys(value, {"class", "level"}, label)
        return {"class": text(value["class"], label), "level": number(value.get("level", 1), label, 1, 100)}
    if "level" in value:
        keys(value, {"level", "basis"}, label)
        basis = value.get("basis", "source")
        if basis not in {"source", "character"}:
            raise ValueError(f"{label}: level basis must be source or character")
        return {"level": number(value["level"], label, 1, 100), "basis": basis}
    if "ability" in value:
        keys(value, {"ability", "minimum"}, label)
        if value["ability"] not in ABILITIES:
            raise ValueError(f"{label}: unknown ability")
        return {"ability": value["ability"], "minimum": number(value.get("minimum"), label, 0, 100)}
    if "skill" in value:
        keys(value, {"skill", "rank"}, label)
        return {"skill": text(value["skill"], label), "rank": number(value.get("rank", 1), label, 0, 3)}
    raise ValueError(f"{label}: unsupported condition")


def dependencies(value):
    if not value:
        return set()
    if "choice" in value:
        return {value["choice"]}
    return set().union(*(dependencies(child) for key in ("all", "any") for child in value.get(key, [])),
                       dependencies(value["not"]) if "not" in value else set())


def per_choice(value, label):
    keys(value, {"choice", "includes"}, label)
    return {"choice": text(value.get("choice"), label), "includes": text(value.get("includes"), label)}


def effects(value, label):
    result = {}
    for key, raw in obj(value, label).items():
        if key in NUMERIC_EFFECTS:
            result[key] = number(raw, label + "." + key)
        elif key in MAP_EFFECTS:
            result[key] = {text(name, label): number(amount, label) for name, amount in obj(raw, label).items()}
            if key in {"abilities", "saveBonuses", "abilitySkillBonuses"} and result[key].keys() - ABILITIES:
                raise ValueError(f"{label}.{key}: unknown ability")
        elif key in LIST_EFFECTS:
            result[key] = [text(item, label) for item in items(raw, label)]
        elif key in BOOLEAN_EFFECTS:
            result[key] = flag(raw, label)
        elif key == "castingTradition" and raw in TRADITIONS | {"any"}:
            result[key] = raw
        else:
            raise ValueError(f"{label}: unsupported effect {key!r}")
    return result


def selector(value, label):
    keys(value, {"entry", "feature", "level", "group", "option", "choice"}, label)
    result = deepcopy(value)
    if "entry" in result:
        entry = items(result["entry"], label + ".entry")
        if len(entry) != 3 or any(not isinstance(part, str) for part in entry):
            raise ValueError(f"{label}: entry must be [section, group, name]")
    for key in {"feature", "group", "option", "choice"} & result.keys():
        text(result[key], label + "." + key)
    if "level" in result:
        result["level"] = number(result["level"], label, 1, 100)
    return result


def mechanics(value, label):
    keys(value, {"label", "choices", "effects", "grants", "baseGrants", "featGrants", "notes", "proficiencies", "repeatLimit", "repeatRequirements", "prerequisites", "abilityIncrease", "manual"}, label)
    result = deepcopy(value)
    if "manual" in result:
        text(result["manual"], label + ".manual")
        if result.keys() - {"manual", "label", "notes"}:
            raise ValueError(f"{label}: a manual rule cannot also declare automatic mechanics")
    for key in ("notes", "repeatRequirements"):
        if key in result:
            result[key] = [text(item, label + "." + key) for item in items(result[key], label)]
    if "repeatLimit" in result:
        result["repeatLimit"] = number(result["repeatLimit"], label, 1, 100)
    if "abilityIncrease" in result:
        result["abilityIncrease"] = flag(result["abilityIncrease"], label)
    if "prerequisites" in result:
        result["prerequisites"] = condition(result["prerequisites"], label + ".prerequisites")
        if dependencies(result["prerequisites"]):
            raise ValueError(f"{label}: prerequisites cannot depend on the source's own choices")
        if result.get("baseGrants"):
            raise ValueError(f"{label}: conditional rules must use grants, not unconditional baseGrants")
    if "label" in result:
        text(result["label"], label + ".label")
    if "proficiencies" in result:
        keys(result["proficiencies"], PROFICIENCIES, label + ".proficiencies")
        result["proficiencies"] = {key: [text(item, label) for item in items(values, label)] for key, values in result["proficiencies"].items()}
    choices = []
    for raw in items(result.get("choices", []), label + ".choices"):
        keys(raw, {"key", "label", "type", "count", "countByLevel", "levelBasis", "options", "abilities", "rankBelow", "when", "perChoice", "optional", "upgradeable", "repeat", "level", "traditions", "grantSpell", "targetMode", "baseFeature"}, label + ".choice")
        row = deepcopy(raw)
        text(row.get("key"), label + ".choice.key")
        if not row["key"].replace("-", "").replace("_", "").isalnum() or row["key"].endswith("-sources"):
            raise ValueError(f"{label}: invalid or reserved choice key")
        text(row.get("label"), label + ".choice.label")
        row["type"] = row.get("type", "select")
        if row["type"] not in CHOICE_TYPES:
            raise ValueError(f"{label}: unsupported choice type {row['type']!r}")
        common = {"key", "label", "type", "count", "countByLevel", "levelBasis", "when", "perChoice", "optional", "upgradeable", "repeat"}
        specific = {"select": {"options"}, "text": set(), "ability": {"abilities"}, "skill": {"rankBelow"}, "spell": {"level", "traditions", "grantSpell"}, "upgrade-target": {"targetMode", "baseFeature"}}
        unexpected = row.keys() - common - specific[row["type"]]
        if unexpected:
            raise ValueError(f"{label}: unsupported fields for {row['type']}: {', '.join(sorted(unexpected))}")
        if row["key"] in {"__proto__", "constructor", "prototype"}:
            raise ValueError(f"{label}: reserved choice key")
        row["count"] = number(row.get("count", 1), label, 0, 100)
        for key in ("optional", "upgradeable", "repeat"):
            if key in row:
                row[key] = flag(row[key], label)
        if "when" in row:
            row["when"] = condition(row["when"], label + ".when")
        if "perChoice" in row:
            row["perChoice"] = per_choice(row["perChoice"], label + ".perChoice")
        if row.get("levelBasis", "source") not in {"source", "character"}:
            raise ValueError(f"{label}: unknown level basis")
        if "countByLevel" in row:
            rows = items(row["countByLevel"], label)
            row["countByLevel"] = []
            for count in rows:
                keys(count, {"level", "count"}, label)
                row["countByLevel"].append({"level": number(count.get("level"), label, 1, 100), "count": number(count.get("count"), label, 0, 100)})
            levels = [item["level"] for item in row["countByLevel"]]
            if levels != sorted(set(levels)):
                raise ValueError(f"{label}: countByLevel levels must be unique and ascending")
        if row["type"] == "select":
            options = []
            for item in items(row.get("options"), label + ".options"):
                keys(item, {"id", "name", "details", "requires", "repeatLimit", "effects"}, label + ".option")
                item = deepcopy(item)
                text(item.get("id"), label + ".option.id")
                text(item.get("name"), label + ".option.name")
                if "effects" in item:
                    item["effects"] = effects(item["effects"], label + ".option.effects")
                if "repeatLimit" in item:
                    item["repeatLimit"] = number(item["repeatLimit"], label, 1, 100)
                item["requires"] = [text(name, label) for name in items(item.get("requires", []), label)]
                options.append(item)
            ids = [item["id"] for item in options]
            if len(ids) != len(set(ids)):
                raise ValueError(f"{label}: duplicate option ID")
            for item in options:
                if set(item["requires"]) - set(ids) or item["id"] in item["requires"]:
                    raise ValueError(f"{label}: unknown or self-referencing option prerequisite")
            checked, pending = set(), set()
            def check_option(key):
                if key in pending:
                    raise ValueError(f"{label}: circular option prerequisite")
                if key in checked:
                    return
                pending.add(key)
                for required in next(item for item in options if item["id"] == key)["requires"]:
                    check_option(required)
                pending.remove(key)
                checked.add(key)
            for key in ids:
                check_option(key)
            row["options"] = options
        if row["type"] == "ability":
            row["abilities"] = items(row.get("abilities", sorted(ABILITIES)), label)
            if set(row["abilities"]) - ABILITIES:
                raise ValueError(f"{label}: unknown ability choice")
        if "rankBelow" in row:
            row["rankBelow"] = number(row["rankBelow"], label, 1, 3)
        if row["type"] == "spell":
            row["level"] = number(row.get("level"), label, 0, 20)
            row["traditions"] = items(row.get("traditions", sorted(TRADITIONS)), label)
            if set(row["traditions"]) - TRADITIONS:
                raise ValueError(f"{label}: unknown spell tradition")
            if "grantSpell" in row:
                grant = row["grantSpell"]
                keys(grant, {"ability", "resource", "notes"}, label + ".grantSpell")
                if grant.get("ability", "wis") not in ABILITIES:
                    raise ValueError(f"{label}: unknown spellcasting ability")
                if grant.get("resource", "manual") not in {"manual", "restDice", "free"}:
                    raise ValueError(f"{label}: unsupported spell resource")
        if row["type"] == "upgrade-target":
            mode = row.get("targetMode", "upgrades")
            if mode not in {"upgrades", "ancestry-or-feat", "earlier-archetype"}:
                raise ValueError(f"{label}: unknown target selector")
            row["targetMode"] = mode
            if "baseFeature" in row:
                text(row["baseFeature"], label + ".baseFeature")
        choices.append(row)
    by_key = {row["key"]: row for row in choices}
    if len(by_key) != len(choices):
        raise ValueError(f"{label}: duplicate choice key")
    ordered, visiting = [], set()
    def visit(key):
        if key in visiting:
            raise ValueError(f"{label}: circular choice dependency at {key!r}")
        if any(item["key"] == key for item in ordered):
            return
        if key not in by_key:
            raise ValueError(f"{label}: missing choice {key!r}")
        visiting.add(key)
        for dependency in dependencies(by_key[key].get("when")) | dependencies(by_key[key].get("perChoice")):
            visit(dependency)
        visiting.remove(key)
        ordered.append(by_key[key])
    for key in by_key:
        visit(key)
    result["choices"] = ordered
    def check_condition(test):
        if not test:
            return
        if "choice" in test:
            if test["choice"] not in by_key:
                raise ValueError(f"{label}: missing condition choice {test['choice']!r}")
            field = by_key[test["choice"]]
            options = [item["id"] for item in field.get("options", [])] if field["type"] == "select" else field.get("abilities") if field["type"] == "ability" else None
            if options is not None and test["includes"] not in options:
                raise ValueError(f"{label}: unknown condition option {test['includes']!r}")
        for key in ("all", "any"):
            for child in test.get(key, []):
                check_condition(child)
        if "not" in test:
            check_condition(test["not"])
    for field in choices:
        check_condition(field.get("when"))
        check_condition(field.get("perChoice"))
    declared = []
    for raw in items(result.get("effects", []), label + ".effects"):
        keys(raw, {"add", "target", "choice", "amount", "when"}, label + ".effect")
        row = deepcopy(raw)
        if "add" in row:
            if row.keys() - {"add", "when"}:
                raise ValueError(f"{label}: fixed and selected effects cannot be mixed")
            row["add"] = effects(row["add"], label)
        else:
            if row.get("target") not in MAP_EFFECTS | {"proficiencies." + name for name in PROFICIENCIES}:
                raise ValueError(f"{label}: unsupported selected effect target")
            if row.get("choice") not in by_key:
                raise ValueError(f"{label}: selected effect references a missing choice")
            row["amount"] = number(row.get("amount", 1), label)
        if "when" in row:
            row["when"] = condition(row["when"], label)
            check_condition(row["when"])
            if dependencies(row["when"]) - by_key.keys():
                raise ValueError(f"{label}: effect references a missing condition choice")
        declared.append(row)
    result["effects"] = declared
    feat_grants = []
    for raw in items(result.get("featGrants", []), label + ".featGrants"):
        keys(raw, {"key", "label", "count", "when", "perChoice", "noAbilityIncrease"}, label + ".featGrant")
        row = deepcopy(raw)
        text(row.get("key"), label + ".featGrant.key")
        row["count"] = number(row.get("count", 1), label, 1, 20)
        if "noAbilityIncrease" in row:
            row["noAbilityIncrease"] = flag(row["noAbilityIncrease"], label)
        if "when" in row:
            row["when"] = condition(row["when"], label)
            check_condition(row["when"])
            if dependencies(row["when"]) - by_key.keys():
                raise ValueError(f"{label}: feat grant references a missing choice")
        if "perChoice" in row:
            row["perChoice"] = per_choice(row["perChoice"], label)
            check_condition(row["perChoice"])
        feat_grants.append(row)
    if len({row["key"] for row in feat_grants}) != len(feat_grants):
        raise ValueError(f"{label}: duplicate feat grant key")
    result["featGrants"] = feat_grants
    for key in ("grants", "baseGrants"):
        grants = []
        for raw in items(result.get(key, []), label + "." + key):
            keys(raw, {"target", "from", "count", "countByLevel", "when", "perChoice", "ownerKey"}, label + ".grant")
            row = deepcopy(raw)
            row["count"] = number(row.get("count", 1), label, 1, 100)
            if "countByLevel" in row:
                progression = []
                for step in items(row["countByLevel"], label):
                    keys(step, {"level", "count"}, label)
                    progression.append({"level": number(step.get("level"), label, 1, 100), "count": number(step.get("count"), label, 0, 100)})
                levels = [step["level"] for step in progression]
                if levels != sorted(set(levels)):
                    raise ValueError(f"{label}: grant levels must be unique and ascending")
                row["countByLevel"] = progression
            if row.get("ownerKey", "grant") not in {"source", "grant"}:
                raise ValueError(f"{label}: unknown grant ownership mode")
            if ("target" in row) == ("from" in row):
                raise ValueError(f"{label}: grant needs exactly one target or selection")
            if "target" in row:
                row["target"] = selector(row["target"], label)
            elif row["from"] not in by_key or by_key[row["from"]]["type"] != "upgrade-target":
                raise ValueError(f"{label}: grant must reference an upgrade-target choice")
            if key == "baseGrants" and ("from" in row or "when" in row or "perChoice" in row):
                raise ValueError(f"{label}: base grants must be unconditional static targets")
            if "when" in row:
                row["when"] = condition(row["when"], label)
                check_condition(row["when"])
                if dependencies(row["when"]) - by_key.keys():
                    raise ValueError(f"{label}: grant references a missing condition choice")
            if "perChoice" in row:
                row["perChoice"] = per_choice(row["perChoice"], label)
                check_condition(row["perChoice"])
            grants.append(row)
        result[key] = grants
    return result


def attach(sections, document=None):
    """Move mechanics out of readable details; attach validated sidecar declarations."""
    entries = {(section["key"], entry["group"], entry["name"]): entry
               for section in sections.values() for entry in section["entries"]}
    for identity, entry in entries.items():
        details = entry["details"]
        if isinstance(details, dict) and "automation" in details:
            entry["details"] = {key: value for key, value in details.items() if key != "automation"}
            entry["automation"] = mechanics(details["automation"], f"{entry['source']}: {identity}")
    if document is None:
        return
    keys(document, {"version", "rules"}, "character-automation.yaml")
    if number(document.get("version"), "automation version", 1, 1) != 1:
        raise ValueError("unsupported automation version")
    seen = set()
    for index, raw in enumerate(items(document.get("rules"), "automation rules")):
        label = f"character-automation.yaml rule {index + 1}"
        keys(raw, {"entry", "feature", "level", "group", "option", "mechanics"}, label)
        select = selector({key: value for key, value in raw.items() if key != "mechanics"}, label)
        identity = tuple(select.get("entry", []))
        if identity not in entries:
            raise ValueError(f"{label}: missing entry {identity!r}")
        signature = json.dumps(select, sort_keys=True)
        if signature in seen:
            raise ValueError(f"{label}: duplicate source selector")
        seen.add(signature)
        entry = entries[identity]
        definition = mechanics(raw.get("mechanics"), label)
        if not (select.keys() - {"entry"}):
            if "automation" in entry:
                raise ValueError(f"{label}: source already has inline automation")
            entry["automation"] = definition
        else:
            entry.setdefault("automationRules", []).append({"select": select, "mechanics": definition})


def apply(metadata, sections):
    """Resolve feature/group references against the complete compiled snapshot."""
    entries = {json.dumps([section["key"], entry["group"], entry["name"]], ensure_ascii=False, separators=(",", ":")): (section["key"], entry)
               for section in sections for entry in section["entries"]}
    owners = {owner["entryId"]: owner for key in ("classes", "archetypes", "races") for owner in metadata[key]}
    sources, pending, status = {}, [], []
    def locate(select, default_entry):
        entry_id = json.dumps(select["entry"], ensure_ascii=False, separators=(",", ":")) if "entry" in select else default_entry
        if entry_id not in entries:
            raise ValueError(f"automation: missing target entry {entry_id}")
        owner = owners.get(entry_id)
        candidates = owner.get("features", owner.get("traits", [])) if owner else []
        if "feature" in select:
            candidates = [feature for feature in candidates if feature["name"] == select["feature"] and ("level" not in select or feature["level"] == select["level"])]
        elif owner:
            candidates = list(candidates)
        else:
            candidates = [{"id": entry_id, "name": entries[entry_id][1]["name"], "choices": []}]
        if "group" in select or "option" in select:
            groups = [group for feature in candidates for group in feature.get("choices", []) if "group" not in select or group["label"] == select["group"]]
            if "option" in select:
                candidates = [option for group in groups for option in group["options"] if option["name"] == select["option"]]
            else:
                candidates = groups
        if len(candidates) != 1:
            raise ValueError(f"automation: target must resolve once, found {len(candidates)} for {select!r}")
        return candidates[0], entry_id
    for entry_id, (section, entry) in entries.items():
        declarations = list(entry.get("automationRules", []))
        if "automation" in entry:
            definition = entry["automation"]
            if section in {"feats", "backgrounds"}:
                declarations.insert(0, {"select": {"entry": json.loads(entry_id)}, "mechanics": definition})
            elif entry_id in owners:
                owner = owners[entry_id]
                feature = {"id": entry_id + ":automation", "name": definition.get("label", entry["name"]), "level": owner.get("minLevel", 1), "details": "", "choices": []}
                owner.setdefault("traits" if section == "races" else "features", []).append(feature)
                declarations.insert(0, {"resolved": feature, "mechanics": definition})
            else:
                raise ValueError(f"automation: unsupported declaration source section {section!r}")
        for declaration in declarations:
            source, _ = (declaration["resolved"], entry_id) if "resolved" in declaration else locate(declaration["select"], entry_id)
            definition = deepcopy(declaration["mechanics"])
            if source["id"] in sources:
                raise ValueError(f"automation: duplicate declaration for {source['id']}")
            pending.append((source, entry_id, definition))
            if any(definition.get(key) for key in ("choices", "effects", "grants", "featGrants", "manual", "proficiencies", "repeatLimit", "repeatRequirements", "prerequisites")):
                source["automationId"] = source["id"]
                sources[source["id"]] = definition
            status.append({"source": source["id"], "name": source["name"], "status": "manual" if definition.get("manual") else "declared"})
    option_groups = {option["id"]: group["id"] for owner in owners.values()
                     for feature in owner.get("features", owner.get("traits", []))
                     for group in feature.get("choices", []) for option in group["options"]}
    graph = {}
    for source, entry_id, definition in pending:
        for key in ("grants", "baseGrants"):
            for grant in definition[key]:
                if "target" not in grant:
                    continue
                select = {name: value for name, value in grant["target"].items() if name != "choice"}
                target, _ = locate(select, entry_id)
                if "choice" in grant["target"]:
                    choice = grant["target"]["choice"]
                    target_rule = sources.get(target["id"])
                    if key == "baseGrants" or not target_rule or not any(field["key"] == choice and field.get("upgradeable") for field in target_rule["choices"]):
                        raise ValueError(f"automation: missing upgradeable target choice {grant['target']!r}")
                    grant["targetSource"], grant["targetChoice"] = target["id"], choice
                    graph.setdefault(source["id"], set()).add(target["id"])
                    continue
                if "options" not in target:
                    raise ValueError(f"automation: a static grant must target a choice group: {grant['target']!r}")
                if key != "baseGrants" and target.get("kind") == "feat":
                    raise ValueError("automation: upgrade grants cannot grant feats; use featGrants explicitly")
                if key != "baseGrants":
                    grant["allowed"] = [option["id"] for option in target["options"] if not option.get("grantsFeat")]
                grant["groupId"] = target["id"]
                if key == "baseGrants":
                    addition = {"count": grant["count"]}
                    if "countByLevel" in grant:
                        addition["countByLevel"] = grant["countByLevel"]
                    if source["id"] in option_groups:
                        addition["requiresChoice"] = {"groupId": option_groups[source["id"]], "optionId": source["id"]}
                    else:
                        addition["featureId"] = source["id"]
                    target.setdefault("additionalGrants", []).append(addition)
    checked, visiting = set(), set()
    def visit_source(source):
        if source in visiting:
            raise ValueError(f"automation: circular static upgrade grant at {source}")
        if source in checked:
            return
        visiting.add(source)
        for target in graph.get(source, []):
            visit_source(target)
        visiting.remove(source)
        checked.add(source)
    for source in graph:
        visit_source(source)
    declared_ids = {item["source"] for item in status}
    for entry_id, (section, entry) in entries.items():
        if section in {"feats", "backgrounds"} and entry_id not in declared_ids:
            status.append({"source": entry_id, "name": entry["name"], "status": "legacy"})
    metadata["automation"] = {"version": 1, "sources": sources, "coverage": status}
