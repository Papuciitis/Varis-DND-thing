"""Workbook imports must preserve rule text without changing existing spells."""

from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from xml.sax.saxutils import escape
from zipfile import ZipFile

import yaml

try:
    from scripts import import_monsters
except ImportError:
    import_monsters = None


def workbook_bytes(creatures, spells=(), *, date1904=False):
    """Build a tiny portable source workbook; CI does not need the user's file."""
    def sheet_xml(rows):
        content = []
        for number, cells in rows:
            values = []
            for column, value in cells.items():
                address = f"{column}{number}"
                if isinstance(value, tuple):
                    raw, style = value
                    values.append(f'<c r="{address}" s="{style}"><v>{escape(raw)}</v></c>')
                else:
                    values.append(f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>')
            content.append(f'<row r="{number}">{"".join(values)}</row>')
        return ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                f'<sheetData>{"".join(content)}</sheetData></worksheet>')

    stream = BytesIO()
    with ZipFile(stream, "w") as archive:
        archive.writestr("xl/workbook.xml", (
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<workbookPr date1904="{int(date1904)}"/><sheets>'
            '<sheet name="creatures" sheetId="1" r:id="rId1"/>'
            '<sheet name="spells" sheetId="2" r:id="rId2"/></sheets></workbook>'))
        archive.writestr("xl/_rels/workbook.xml.rels", (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/animals.xml"/>'
            '<Relationship Id="rId2" Target="worksheets/magic.xml"/></Relationships>'))
        archive.writestr("xl/styles.xml", (
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<numFmts count="1"><numFmt numFmtId="164" formatCode="d/m"/></numFmts>'
            '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'))
        archive.writestr("xl/worksheets/animals.xml", sheet_xml(creatures))
        archive.writestr("xl/worksheets/magic.xml", sheet_xml(spells))
    return stream.getvalue()


class MonsterImportTests(unittest.TestCase):
    def importer(self):
        self.assertIsNotNone(import_monsters, "The read-only monster importer has not been implemented")
        return import_monsters

    def test_preserves_displayed_fraction_cr_and_original_rule_fields(self):
        importer = self.importer()
        source = workbook_bytes([
            (1, {"A": "name"}),
            (2, {"A": "animated skull", "B": "small undead", "C": ("46113.0", 1),
                 "D": ("12.0", 0), "E": "-", "F": "1d4+1", "G": "30ft, float",
                 "H": ("7.0", 0), "N": "darkvision", "O": "Peon: tools and shields",
                 "P": "Bite +3: 1d4+3 p, DC 12"}),
        ])
        rows = importer.read_workbook(BytesIO(source))
        entry = importer.monster_collection(rows)["entries"][0]
        self.assertEqual(entry["cr"], "1/4")
        self.assertEqual(entry["ac"], "12")
        self.assertEqual(entry["block"], "-")
        self.assertEqual(entry["abilities"], {"str": "7"})
        self.assertEqual(entry["properties"], "Peon: tools and shields")
        self.assertEqual(entry["actions"], [{"name": "Bite +3", "description": "1d4+3 p, DC 12"}])
        self.assertEqual(entry["source_ref"], "dnd spreadsheet.xlsx / creatures!A2:P2")
        self.assertIn("date", " ".join(entry["notes"]).lower())

    def test_marks_missing_core_fields_without_filling_them(self):
        importer = self.importer()
        rows = importer.read_workbook(BytesIO(workbook_bytes([
            (1, {"A": "name"}), (12, {"A": "False wisp", "B": "small elemental", "C": "2", "D": "14"}),
        ])))
        entry = importer.monster_collection(rows)["entries"][0]
        self.assertEqual(entry["status"], "Incomplete draft")
        self.assertNotIn("hp", entry)
        self.assertNotIn("speed", entry)
        self.assertNotIn("abilities", entry)
        self.assertNotIn("actions", entry)
        self.assertIn("HP", " ".join(entry["notes"]))

    def test_only_links_verified_existing_spell_identities(self):
        importer = self.importer()
        rows = importer.read_workbook(BytesIO(workbook_bytes(
            [(1, {"A": "name"}), (3, {"A": "animated skeleton"})],
            [(1, {"C": "name"}), (29, {"C": "animate skeleton", "M": "animated skeleton"}),
             (357, {"C": "bound imp", "M": "arcane imp"})],
        )))
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            (data_dir / "spells.yaml").write_text(yaml.safe_dump({
                "section": "spells", "entries": [
                    {"name": "Create skeleton", "group": "Arcane spells", "effect": "Existing rule"},
                ],
            }), encoding="utf-8")
            links, unmapped = importer.summon_links(rows, data_dir)
        self.assertEqual(len(links["summon_links"]), 1)
        link = links["summon_links"][0]
        self.assertEqual((link["spell"], link["group"]), ("Create skeleton", "Arcane spells"))
        self.assertEqual(link["summons"][0]["monster"], "animated skeleton")
        self.assertIn("take priority", link["summons"][0]["notes"])
        self.assertEqual(unmapped, [{"row": 357, "spell": "bound imp"}])

    def test_rejects_unknown_creature_references(self):
        importer = self.importer()
        rows = importer.read_workbook(BytesIO(workbook_bytes(
            [(1, {"A": "name"}), (2, {"A": "known"})],
            [(1, {"C": "name"}), (24, {"C": "Animate skull", "M": "missing"})],
        )))
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            (data_dir / "spells.yaml").write_text(yaml.safe_dump({
                "section": "spells", "entries": [{"name": "Animate skull", "group": "Arcane spells"}],
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing"):
                importer.summon_links(rows, data_dir)

    def test_reads_shared_strings_and_preserves_unevaluated_formulas(self):
        importer = self.importer()
        source = workbook_bytes([(1, {"A": "name"}), (2, {"A": "placeholder"})])
        original = ZipFile(BytesIO(source))
        modified = BytesIO()
        with original, ZipFile(modified, "w") as archive:
            for filename in original.namelist():
                content = original.read(filename)
                if filename == "xl/worksheets/animals.xml":
                    content = (b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                               b'<sheetData><row r="2"><c r="A2" t="s"><v>0</v></c>'
                               b'<c r="F2"><f>2+3</f><v>5</v></c></row></sheetData></worksheet>')
                archive.writestr(filename, content)
            archive.writestr("xl/sharedStrings.xml", (
                '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                '<si><r><t>shared </t></r><r><t>creature</t></r></si></sst>'))
        entry = importer.monster_collection(importer.read_workbook(BytesIO(modified.getvalue())))["entries"][0]
        self.assertEqual(entry["name"], "shared creature")
        self.assertEqual(entry["hp"], "=2+3")

    def test_export_directory_does_not_replace_the_canonical_spell_catalog(self):
        importer = self.importer()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.xlsx"
            source.write_bytes(workbook_bytes(
                [(1, {"A": "name"}), (2, {"A": "animated skull"})],
                [(1, {"C": "name"}), (24, {"C": "animate skull", "M": "animated skull"})],
            ))
            output = directory / "generated"
            catalog = directory / "canonical"
            catalog.mkdir()
            (catalog / "spells.yaml").write_text(yaml.safe_dump({
                "section": "spells", "entries": [{"name": "Animate skull", "group": "Arcane spells"}],
            }), encoding="utf-8")
            self.assertEqual(importer.main([str(source), "--output-dir", str(output),
                                            "--catalog-dir", str(catalog)]), 0)
            links = yaml.safe_load((output / "summon-links.yaml").read_text(encoding="utf-8"))
            self.assertEqual(links["summon_links"][0]["spell"], "Animate skull")

    def test_check_mode_detects_drift_without_writing_or_changing_source(self):
        importer = self.importer()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.xlsx"
            original = workbook_bytes([(1, {"A": "name"}), (2, {"A": "simple creature"})])
            source.write_bytes(original)
            output = directory / "data"
            self.assertEqual(importer.main([str(source), "--output-dir", str(output)]), 0)
            self.assertEqual(importer.main([str(source), "--output-dir", str(output), "--check"]), 0)
            monsters = output / "monsters.yaml"
            monsters.write_text("changed\n", encoding="utf-8")
            self.assertEqual(importer.main([str(source), "--output-dir", str(output), "--check"]), 1)
            self.assertEqual(monsters.read_text(encoding="utf-8"), "changed\n")
            self.assertEqual(source.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
