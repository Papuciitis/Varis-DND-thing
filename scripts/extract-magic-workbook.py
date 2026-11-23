"""Extract the six item tabs without altering the original workbook or conversions."""

import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parents[1]
RARITIES = ("Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact")
N = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def extract(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(si.itertext()) for si in root.findall("m:si", N)]
        relationships = {
            record.attrib["Id"]: record.attrib["Target"]
            for record in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        result = []
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.findall("m:sheets/m:sheet", N):
            if sheet.attrib["name"] not in RARITIES:
                continue
            target = relationships[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows = []
            root = ET.fromstring(archive.read(target))
            for row in root.findall("m:sheetData/m:row", N):
                cells = {}
                for cell in row.findall("m:c", N):
                    value_node = cell.find("m:v", N)
                    value = value_node.text if value_node is not None else None
                    if cell.attrib.get("t") == "s" and value is not None:
                        value = shared[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(cell.find("m:is", N).itertext())
                    if value is not None and str(value).strip():
                        cells[cell.attrib["r"]] = value
                if cells:
                    rows.append(cells)
            result.append({"name": sheet.attrib["name"], "rows": rows})
        if {sheet["name"] for sheet in result} != set(RARITIES):
            raise ValueError("Workbook must contain all six magic-item rarity tabs")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=ROOT / "data/magic-items/source/Magic-item-generator.xlsx")
    parser.add_argument("--output", type=Path, default=ROOT / "data/magic-items/source/workbook.json")
    args = parser.parse_args()
    data = extract(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {sum(len(sheet['rows']) - 1 for sheet in data)} items from {len(data)} tabs")
