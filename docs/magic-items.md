# Converted magic items

The Magic items section contains 300 converted campaign items: 43 Common, 67 Uncommon, 75 Rare, 63 Very Rare, 48 Legendary, and 4 Artifact. The displayed description is the playable Varis version. Original workbook text and conversion notes are collapsed reference material.

All item sources live in `data/magic-items/`, separately from ordinary equipment and class or spell definitions. The six rarity YAML files are editable, tracked source files. Each item has a stable ID based on its workbook tab and row, so changing its displayed name does not break a magic-item inventory reference. Keep those IDs when editing.

The original workbook is preserved in `data/magic-items/source/Magic-item-generator.xlsx`. `source/workbook.json` is an exact cell snapshot of its six item tabs. The unrelated `covidsuds` tab is retained only in the original workbook and is excluded from the item snapshot and compendium. Run `python scripts/extract-magic-workbook.py` to reproduce the snapshot; this does not overwrite any converted rules.

## Conversion decisions

Each item has a complete converted description, its source price and attunement requirement, original text, exact cell range, and a note explaining its conversion. The seven source rows without descriptions have newly authored playable effects identified in their notes. Initial prices and rarity assignments retain the workbook values rather than recalculating them from a different game's economy. You can edit the current name, price, rarity, and rules; the separate `source_*` fields preserve the original workbook values and remain unchanged in the page editor.

The separate Rules entries under **Magic items** state this collection's common attunement, activation, recharge, enhancement, Block, and item-casting conventions. They are newly adopted conversion rules for this collection. Specific item text takes precedence over these conventions.

Conversions use current Varis base equipment and maneuvers, Block and unblocked-strike triggers, Fatigue, rest dice, current conditions, and the campaign's casting system. Named current spells use their Varis definitions. Powers without an appropriate spell use a self-contained converted effect. Dawn and dusk recharge remain distinct from a one-day short rest and one-week long rest.

## Editing in the page

Open **Magic items**, choose an item, and use **Edit item** to change its converted rules. Page edits are saved in this browser, so the item can be adjusted during play. Original workbook text remains available for comparison. Editing the page cannot directly commit a file to Git.

Use the page's backup export and import controls to move browser edits between devices. Export the item's complete source collection when an edit should become the shared rule, replace the corresponding file under `data/magic-items/`, rebuild, then commit that source file. Source export first validates and saves the current form, then includes all entries from that source file with their current edits. It uses JSON syntax that is also valid YAML. Keep the file's existing `.yaml` name.

Character equipment uses a converted item's `base_item`, explicit damage and property overrides, and `magic_bonus` for supported attacks, AC, and weapon Block DC. Mark required attunement before its magical statistics apply. Custom weapon type and group preserve the correct training requirements. Shield enhancements improve AC; any special Bash bonuses remain manual.

Conditional bonuses, extra damage, charges, summons, curses, and timed powers remain explicit rules to resolve and track manually. Volantes Vitaelum and Pay to Win explicitly use manual attacks because their separate or variable bonuses do not fit the ordinary attack calculation. Read the description before activating a power.

## Validation

`tests/test_magic_items.py` reconciles all 300 source IDs, original names and prices, original descriptions, cell references, and source rarity counts against the snapshot, verifies current base-item references, and reproduces the snapshot from the preserved workbook. Converted names, prices, rarity and rules remain editable. Browser and equipment checks cover editing, import/export, stable item identity, and supported equipment calculations.
