# Monster themes and settings

The Monster manual opens with 15 encounter themes covering all 215 profiles. Each card shows a count and example creatures. Choose a theme to browse its expandable statblocks, combine it with creature type, CR and text search, or use **Browse all** for the complete list. **Pages** remains available under More filters. Monster-page breadcrumbs and previous/next navigation follow the selected creature's encounter theme.

Themes are editorial encounter suggestions, not new habitat restrictions, allegiances or campaign canon. Each current monster has one primary theme. For example, dragons share one shelf across all imports; undead cross the campaign and workbook collections; the workshop shelf brings artificers, robotic companions and flesh constructs together.

| Theme / setting | Monsters |
| --- | ---: |
| Caverns & lost ruins | 8 |
| Cities, guards & outlaws | 13 |
| Constructs & workshops | 15 |
| Cults, mages & dark bargains | 7 |
| Deserts & canyons | 12 |
| Dragons & their lairs | 19 |
| Earth & crystal realms | 29 |
| Eldritch nightmares | 21 |
| Fire, storms & sky | 7 |
| Forests & wilds | 21 |
| Frozen wastes | 6 |
| Infernal invasions | 8 |
| Orc & gnoll warbands | 19 |
| Seas & coasts | 8 |
| Tombs & restless dead | 22 |

Source filenames, original collection identities, source notes, spell/summon links and saved-edit targets stay intact. Historical source-group URLs still work. Theme names appear in search results and are searchable along with names and rule text.

To change an individual creature's placement, edit **Theme / setting** in the monster editor; existing theme names are suggested, and a new campaign/theme name is allowed. Export or save custom.yaml normally. Older browser overrides inherit their compiled creature's theme unless they explicitly select another. A new custom creature with no theme appears under **Other encounters**.

`data/monster-themes.yaml` contains the reviewed primary assignment for each imported profile. The compiler attaches only `encounter_theme`, after resolving targeted overrides. Explicit saved theme overrides take priority. Source importers continue producing the same statblocks; source-file layout is independent of browsing. Add new imported creatures to the assignment file when choosing their primary encounter theme.

