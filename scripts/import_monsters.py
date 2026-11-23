"""Read creature references from XLSX without modifying or exporting the workbook.

Only the two generated YAML files are written. Existing spell and background
definitions remain authoritative; summon links identify workbook reference variants.
"""

import argparse
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
from pathlib import Path, PurePosixPath
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

import yaml


NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
SOURCE_LABEL = "dnd spreadsheet.xlsx"
SPELL_ALIASES = {"animate skeleton": "create skeleton"}
VARIANT_NOTE = (
    "Workbook reference variant. The existing spell's rules and embedded creature "
    "statistics take priority where they differ."
)


class WorkbookRows(dict):
    """Cell text and the locations where Excel date formatting changed display."""

    def __init__(self):
        super().__init__()
        self.converted_dates = set()


def _numeric_text(raw):
    try:
        number = Decimal(raw)
        return str(int(number)) if number == number.to_integral_value() else raw
    except (InvalidOperation, ValueError):
        return raw


def read_workbook(source):
    """Read ordinary XLSX strings/numbers/formulas using ZIP and XML only."""
    result = WorkbookRows()
    with ZipFile(source) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(text.text or "" for text in node.findall(".//m:t", NS)) for node in
                       ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        styles = []
        date_formats = set()
        if "xl/styles.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/styles.xml"))
            date_formats = {int(node.attrib["numFmtId"]) for node in
                            root.findall("m:numFmts/m:numFmt", NS)
                            if node.attrib.get("formatCode", "").lower() == "d/m"}
            styles = [int(node.attrib.get("numFmtId", 0)) for node in
                      root.findall("m:cellXfs/m:xf", NS)]
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        properties = book.find("m:workbookPr", NS)
        date1904 = properties is not None and properties.attrib.get("date1904") in ("1", "true")
        epoch = datetime(1904, 1, 1) if date1904 else datetime(1899, 12, 30)
        relationships = {node.attrib["Id"]: node.attrib["Target"] for node in
                         ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        for sheet in book.findall("m:sheets/m:sheet", NS):
            name = sheet.attrib["name"]
            target = relationships[sheet.attrib[REL_ID]]
            target = target.lstrip("/") if target.startswith("/") else str(PurePosixPath("xl") / target)
            document = ET.fromstring(archive.read(target))
            rows = {}
            for cell in document.findall("m:sheetData/m:row/m:c", NS):
                address = cell.attrib["r"]
                match = re.fullmatch(r"([A-Z]+)(\d+)", address)
                if not match:
                    raise ValueError(f"Invalid cell address {address!r}")
                column, row_number = match.group(1), int(match.group(2))
                value = cell.find("m:v", NS)
                formula = cell.find("m:f", NS)
                kind = cell.attrib.get("t")
                if formula is not None:
                    text = "=" + (formula.text or "")
                elif kind == "inlineStr":
                    text = "".join(node.text or "" for node in cell.findall(".//m:t", NS))
                elif value is None or value.text is None:
                    continue
                elif kind == "s":
                    text = strings[int(value.text)]
                elif kind in ("str", "e"):
                    text = value.text
                else:
                    text = _numeric_text(value.text)
                    style_id = int(cell.attrib.get("s", 0))
                    if (name == "creatures" and column == "C" and style_id < len(styles)
                            and styles[style_id] in date_formats):
                        displayed_date = epoch + timedelta(days=float(value.text))
                        text = f"{displayed_date.day}/{displayed_date.month}"
                        result.converted_dates.add((name, address))
                if text.strip():
                    rows.setdefault(row_number, {})[column] = text.strip()
            result[name] = rows
    if "creatures" not in result:
        raise ValueError("Workbook has no creatures worksheet")
    return result


def _actions(text):
    actions = []
    for segment in text.split("|"):
        segment = segment.strip()
        if not segment:
            continue
        if ":" in segment:
            name, description = segment.split(":", 1)
            actions.append({"name": name.strip(), "description": description.strip()})
        else:
            actions.append({"name": "Action", "description": segment})
    return actions


def monster_collection(workbook):
    """Preserve every nonempty source field; never infer absent creature stats."""
    entries = []
    fields = {"B": "meta", "C": "cr", "D": "ac", "E": "block", "F": "hp", "G": "speed"}
    abilities = dict(zip("HIJKLM", ("str", "dex", "con", "int", "wis", "cha")))
    for row_number, row in sorted(workbook["creatures"].items()):
        if row_number == 1 or not row.get("A"):
            continue
        entry = {"name": row["A"], "group": "Workbook reference creatures"}
        entry.update({field: row[column] for column, field in fields.items() if row.get(column)})
        scores = {ability: row[column] for column, ability in abilities.items() if row.get(column)}
        if scores:
            entry["abilities"] = scores
        if row.get("N"):
            entry["traits"] = [{"name": "Traits", "description": row["N"]}]
        if row.get("O"):
            entry["properties"] = row["O"]
        if row.get("P"):
            entry["actions"] = _actions(row["P"])
        notes = [VARIANT_NOTE]
        missing = [label for column, label in (("D", "AC"), ("F", "HP"), ("G", "speed"), ("P", "actions"))
                   if not row.get(column)]
        if missing:
            entry["status"] = "Incomplete draft"
            notes.append("The source does not provide " + ", ".join(missing) + ".")
        if ("creatures", f"C{row_number}") in workbook.converted_dates:
            notes.append("CR preserves the displayed d/m fraction; Excel stored this cell as a date serial.")
        if row["A"] == "greater crystal elemental":
            notes.append("Source review: Crystal heart refers to a lightning elemental; the intended subject is unresolved.")
        if row["A"] == "cosmic trigon":
            notes.append("Source review: Overloading resonance has malformed damage notation '8dforce sonic'; its dice and save are unresolved.")
        entry["notes"] = notes
        entry["source_ref"] = f"{SOURCE_LABEL} / creatures!A{row_number}:P{row_number}"
        entries.append(entry)
    return {"section": "monsters", "entries": entries}


def _canonical_spells(data_dir):
    spells = {}
    for path in sorted(data_dir.rglob("*")):
        if path.suffix.lower() not in (".yaml", ".yml"):
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
        if isinstance(data, dict) and data.get("section") == "spells":
            entries = data.get("entries", [])
        elif path.name == "arcane_cantrips.yaml" and isinstance(data, list):
            entries = [dict(entry, group="Arcane cantrips") for entry in data]
        else:
            continue
        for entry in entries:
            identity = (entry["name"].strip().casefold(), entry.get("group", "").strip().casefold())
            spells[identity] = (entry["name"], entry.get("group", ""))
    return spells


def summon_links(workbook, data_dir):
    """Link exact names and one reviewed rename; report other source spells."""
    canonical = _canonical_spells(data_dir)
    monsters = {row["A"] for number, row in workbook["creatures"].items() if number > 1 and row.get("A")}
    links, unmapped = [], []
    for number, row in sorted(workbook.get("spells", {}).items()):
        if number == 1 or not row.get("M"):
            continue
        source_name = row.get("C", "")
        name = SPELL_ALIASES.get(source_name.casefold(), source_name.casefold())
        matches = [record for identity, record in canonical.items() if identity[0] == name]
        if len(matches) != 1:
            unmapped.append({"row": number, "spell": source_name})
            continue
        references = [part.strip() for part in row["M"].split(";") if part.strip()]
        for monster in references:
            if monster not in monsters:
                raise ValueError(f"spells!M{number}: unknown creature {monster!r}")
        spell, group = matches[0]
        links.append({"spell": spell, "group": group,
                      "summons": [{"monster": monster, "notes": VARIANT_NOTE} for monster in references],
                      "source_ref": f"{SOURCE_LABEL} / spells!M{number}"})
    return {"summon_links": links}, unmapped


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    repository_data = Path(__file__).resolve().parents[1] / "data"
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output-dir", type=Path, default=repository_data)
    parser.add_argument("--catalog-dir", type=Path, default=repository_data,
                        help="Existing YAML spell catalog used to resolve names (default: repository data)")
    parser.add_argument("--check", action="store_true", help="Compare generated YAML without writing files")
    args = parser.parse_args(argv)
    if args.workbook.resolve() in {(args.output_dir / filename).resolve() for filename in ("monsters.yaml", "summon-links.yaml")}:
        parser.error("The source workbook cannot be an output file")
    workbook = read_workbook(args.workbook)
    monsters = monster_collection(workbook)
    links, unmapped = summon_links(workbook, args.catalog_dir)
    digest = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
    header = f"# Imported read-only from {SOURCE_LABEL}; SHA-256: {digest}\n# Existing Git spell and background rules take priority.\n"
    outputs = {"monsters.yaml": monsters, "summon-links.yaml": links}
    different = []
    for filename, data in outputs.items():
        text = header + yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100)
        path = args.output_dir / filename
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                different.append(filename)
        else:
            args.output_dir.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
    if different:
        print("Generated data differs: " + ", ".join(different), file=sys.stderr)
        return 1
    print(f"{'Checked' if args.check else 'Imported'} {len(monsters['entries'])} creatures and {len(links['summon_links'])} spell links.")
    for item in unmapped:
        print(f"Unmapped source spell: spells!M{item['row']} ({item['spell']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
