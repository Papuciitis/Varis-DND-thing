# Character sheet presentation

The user wants a polished, readable online character sheet informed by existing products, rather than a literal copy of a spreadsheet or another rules expansion.

References inspected: D&D Beyond's public example (https://www.dndbeyond.com/characters/133058471), its desktop/phone customization screenshots, and Roll20's illustrated 2024 character sheet guide (https://help.roll20.net/hc/en-us/articles/30748164251287-Dungeons-Dragons-2024-Character-Sheet). Use their hierarchy and grouping, with original Vara styling and no copied artwork.

Use a compact identity header, prominent HP, compact Arcane Health/Temp HP, separate Block defence area, clear action buttons, and a narrow abilities/skills rail on desktop. Phone layout prioritizes health and combat values, with three-by-two abilities and existing bottom navigation. Keep the light surface/burgundy Vara identity; use typography and spacing rather than ornamental frames.

Preserve all resource inputs, save/backup controls, keyboard access, builder and print output. This pass changes presentation only: spell-resource initialization, backgrounds and the independently identified Block accounting gaps remain separate work. No YAML or mechanical rules changes.

Implementation: restructure rendered health/defence markup, refine header and secondary disclosures, consolidate styles, then run existing interaction checks and inspect desktop, tablet and phone layouts using real character data. Publish the visual update on `codex/character-sheet-layout`, based on the merged `main`, for review without merging or deploying main.
