"""Translate the repository's YAML shapes to the section and entry model used by the site."""

from pathlib import Path

import yaml


SECTIONS = {
    "rules": "Rules of play",
    "classes": "Classes",
    "items": "Items",
    "magic-items": "Magic items",
    "weapon-rules": "Weapon rules",
    "feats": "Feats",
    "races": "Races",
    "spells": "Spells",
    "geomancy-review": "Geomancy spell review",
    "conditions": "Conditions",
    "backgrounds": "Backgrounds",
    "monsters": "Monster manual",
    "design-notes": "Design notes",
}


class RulesLoader(yaml.BaseLoader):
    """Keep rule notation as text and detect keys that YAML would silently overwrite."""

    def construct_mapping(self, node, deep=False):
        mapping = super().construct_mapping(node, deep=deep)
        if len(mapping) != len(node.value):
            keys = set()
            for key_node, _ in node.value:
                key = self.construct_object(key_node, deep=deep)
                if key in keys:
                    raise ValueError(f"duplicate key {key!r} at line {key_node.start_mark.line + 1}")
                keys.add(key)
        return mapping


def mapping(value, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a mapping")
    return value


def sequence(value, label):
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    return value


def name_text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be nonempty text")
    return value.strip()


def named_maps(items, label):
    """Yield all named records in a YAML sequence of mappings."""
    for record in sequence(items, label):
        if not mapping(record, label):
            raise ValueError(f"empty record in {label}")
        yield from record.items()


def named_records(section, records, default_group=""):
    for record in sequence(records, "entries"):
        fields = mapping(record, "entry").copy()
        name = fields.pop("name")
        group = fields.pop("group", default_group)
        yield section, group, name, fields


def weapon_records(data):
    """Convert weapons and their notation glossary without hiding glossary introductions."""
    for group, records in named_maps(data["weapons"], "weapon families"):
        for name, attributes in named_maps(records, group):
            yield "items", group, name, mapping(attributes, name)

    for section_name, content in data.items():
        if section_name == "weapons":
            continue
        glossary = mapping(content, section_name).copy()
        group = section_name.rstrip(":").replace("_", " ").capitalize()
        if "list" in glossary:
            definitions = list(named_maps(glossary.pop("list"), section_name))
            if glossary:
                yield "weapon-rules", group, group, glossary
        else:
            definitions = glossary.items()
        for name, definition in definitions:
            yield "weapon-rules", group, name, definition


def source_records(path, data):
    # An explicit section works in every directory, including future collections.
    if isinstance(data, dict) and "section" in data:
        allowed = {"section", "entries"}
        if data["section"] == "monsters":
            allowed.add("monster_overrides")
        if data.keys() - allowed:
            raise ValueError("collection documents must contain only section and entries")
        yield from named_records(data["section"], data["entries"])
    elif path == "weapons.yaml":
        yield from weapon_records(mapping(data, "weapons document"))
    elif path == "conditions.yaml":
        for group, records in unwrapped(data, "conditions").items():
            for name, details in mapping(records, group).items():
                yield "conditions", group, name, details
    elif path == "feats.yaml":
        for name, details in unwrapped(data, "feats").items():
            yield "feats", "", name, details
    elif path == "races.yml":
        yield from named_records("races", data)
    elif path == "spells/arcane_cantrips.yaml":
        yield from named_records("spells", data, "Arcane cantrips")
    elif path == "class_occultist.yaml":
        for name, details in mapping(data, "class document").items():
            yield "classes", "Base class", name, details
    elif path == "arch_spellblade.yaml":
        yield "classes", "Occultist archetype", "Spellblade", mapping(data, "archetype")
    elif path == "maneuver-notes.yaml":
        fields = mapping(data, "design notes").copy()
        name = fields.pop("name")
        yield "design-notes", "Prototype", name, fields
    else:
        raise ValueError("new files require a section and an entries list")


def unwrapped(data, key):
    if mapping(data, key).keys() != {key}:
        raise ValueError(f"expected one top-level {key!r} key")
    return mapping(data[key], key)


def apply_monster_overrides(documents, sections):
    """Replace catalog monsters using their immutable original source identities."""
    monsters = sections["monsters"]["entries"]
    originals = {(entry["source"], entry["group"], entry["name"]): index
                 for index, entry in enumerate(monsters)}
    targets = set()
    origins = {}
    for path, records in documents:
        try:
            for record in sequence(records, "monster_overrides"):
                record = mapping(record, "monster override")
                if record.keys() != {"target", "entry"}:
                    raise ValueError("monster override must contain only target and entry")
                target = mapping(record["target"], "monster override target")
                if target.keys() != {"source", "group", "name"}:
                    raise ValueError("monster override target must contain source, group and name")
                source = name_text(target["source"], "monster override target source")
                name = name_text(target["name"], "monster override target name")
                if not isinstance(target["group"], str):
                    raise ValueError("monster override target group must be text")
                group = target["group"].strip()
                identity = (source, group, name)
                if identity not in originals:
                    raise ValueError(f"unknown monster override target {identity!r}")
                if identity in targets:
                    raise ValueError(f"duplicate monster override target {identity!r}")
                targets.add(identity)
                fields = mapping(record["entry"], "monster override entry").copy()
                new_name = name_text(fields.pop("name", None), "monster override entry name")
                new_group = fields.pop("group", "")
                if not isinstance(new_group, str):
                    raise ValueError("monster override entry group must be text")
                if fields.keys() & {"section", "source", "monster_target", "monster_overrides"}:
                    raise ValueError("monster override entry cannot replace section or source identity")
                index = originals[identity]
                monsters[index] = {"name": new_name, "group": new_group.strip(),
                    "details": fields, "source": source,
                    "monster_target": {"source": source, "group": group, "name": name}}
                origins[index] = path
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError(f"{path}: {exc}") from exc
    # Names also identify summon references, so current and original names must
    # remain unambiguous even when a monster moves to a different group.
    if documents:
        names = {}
        for index, entry in enumerate(monsters):
            aliases = {entry["name"].casefold()}
            if entry.get("monster_target"):
                aliases.add(entry["monster_target"]["name"].casefold())
            for alias in aliases:
                if alias in names:
                    previous = names[alias]
                    path = origins.get(index, origins.get(previous, entry["source"]))
                    raise ValueError(f"{path}: duplicate or ambiguous monster name {alias!r}")
                names[alias] = index


def apply_summon_links(document, sections):
    """Attach references only; imported creatures never replace a spell's mechanics."""
    if mapping(document, "summon links document").keys() != {"summon_links"}:
        raise ValueError("expected only summon_links")
    spells = {(entry["group"], entry["name"]): entry for entry in sections["spells"]["entries"]}
    monsters = {}
    for entry in sections["monsters"]["entries"]:
        aliases = {entry["name"]}
        if entry.get("monster_target"):
            aliases.add(entry["monster_target"]["name"])
        for alias in aliases:
            if alias in monsters:
                raise ValueError(f"ambiguous monster name {alias!r}")
            monsters[alias] = entry
    seen = set()
    for record in sequence(document["summon_links"], "summon_links"):
        record = mapping(record, "summon link")
        if record.keys() - {"spell", "group", "summons", "source_ref"}:
            raise ValueError("unknown summon link fields")
        identity = (record.get("group", ""), name_text(record.get("spell"), "spell"))
        if identity not in spells:
            raise ValueError(f"Unknown spell {identity!r}")
        if identity in seen:
            raise ValueError(f"duplicate summon link for {identity!r}")
        seen.add(identity)
        summons = sequence(record.get("summons"), "summons")
        if not summons:
            raise ValueError("summons must not be empty")
        linked = set()
        resolved_summons = []
        for summon in summons:
            summon = mapping(summon, "summon")
            if summon.keys() - {"monster", "label", "notes"}:
                raise ValueError("unknown summon fields")
            monster = name_text(summon.get("monster"), "monster")
            if monster not in monsters:
                raise ValueError(f"Unknown monster {monster!r}")
            resolved = monsters[monster]["name"]
            if resolved in linked:
                raise ValueError(f"duplicate monster {resolved!r}")
            linked.add(resolved)
            resolved_summons.append(dict(summon, monster=resolved))
        details = mapping(spells[identity]["details"], "spell details")
        if "summons" in details:
            raise ValueError(f"spell {identity!r} already defines summons")
        details["summons"] = resolved_summons
        if record.get("source_ref"):
            details["summon_source"] = name_text(record["source_ref"], "source_ref")


def compile_data(data_dir: Path) -> list[dict]:
    """Build entries in source order, reporting the filename on any invalid record."""
    sections = {key: {"key": key, "title": title, "entries": []} for key, title in SECTIONS.items()}
    seen = set()
    summon_document = None
    has_summon_document = False
    monster_overrides = []
    files = sorted(path for path in data_dir.rglob("*")
                   if path.is_file() and path.suffix.lower() in (".yml", ".yaml"))
    if not files:
        raise ValueError(f"No YAML files in {data_dir}")
    for file in files:
        path = file.relative_to(data_dir).as_posix()
        try:
            data = yaml.load(file.read_text(encoding="utf-8-sig"), Loader=RulesLoader)
            if path == "summon-links.yaml":
                summon_document = data
                has_summon_document = True
                continue
            for section, group, name, details in source_records(path, data):
                if section not in sections:
                    raise ValueError(f"unknown section {section!r}")
                name = name_text(name, "entry name")
                if not isinstance(group, str):
                    raise ValueError(f"group for {name!r} must be text")
                group = group.strip()
                identity = (section, group.casefold(), name.casefold())
                if identity in seen:
                    raise ValueError(f"duplicate entry {name!r} in {section!r}, group {group!r}")
                seen.add(identity)
                sections[section]["entries"].append(
                    {"name": name, "group": group, "details": details, "source": path}
                )
            if isinstance(data, dict) and data.get("section") == "monsters" and "monster_overrides" in data:
                monster_overrides.append((path, data["monster_overrides"]))
        except (KeyError, ValueError, TypeError, yaml.YAMLError) as exc:
            raise ValueError(f"{path}: {exc}") from exc
    apply_monster_overrides(monster_overrides, sections)
    sections["classes"]["entries"].sort(key=lambda entry: entry["group"] != "Base class")
    if has_summon_document:
        try:
            apply_summon_links(summon_document, sections)
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError(f"summon-links.yaml: {exc}") from exc
    return list(sections.values())
