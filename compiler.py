"""Translate the repository's YAML shapes to the section and entry model used by the site."""

from pathlib import Path

import yaml


SECTIONS = {
    "classes": "Classes",
    "items": "Items",
    "weapon-rules": "Weapon rules",
    "feats": "Feats",
    "races": "Races",
    "spells": "Spells",
    "conditions": "Conditions",
    "backgrounds": "Backgrounds",
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
        if data.keys() - {"section", "entries"}:
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


def compile_data(data_dir: Path) -> list[dict]:
    """Build entries in source order, reporting the filename on any invalid record."""
    sections = {key: {"key": key, "title": title, "entries": []} for key, title in SECTIONS.items()}
    seen = set()
    files = sorted(path for path in data_dir.rglob("*")
                   if path.is_file() and path.suffix.lower() in (".yml", ".yaml"))
    if not files:
        raise ValueError(f"No YAML files in {data_dir}")
    for file in files:
        path = file.relative_to(data_dir).as_posix()
        try:
            data = yaml.load(file.read_text(encoding="utf-8-sig"), Loader=RulesLoader)
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
        except (KeyError, ValueError, TypeError, yaml.YAMLError) as exc:
            raise ValueError(f"{path}: {exc}") from exc
    sections["classes"]["entries"].sort(key=lambda entry: entry["group"] != "Base class")
    return list(sections.values())
