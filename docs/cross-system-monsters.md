# Mixed-system monster conversions

86 new editable profiles bring the manual from 215 to **301 monsters** across the existing 15 encounter themes. The original 215 records remain unchanged. The current player spell catalogue remains 439; these additions grant no player spells, class features or magic items.

| Supplied material | Profiles | Playable file |
| --- | ---: | --- |
| Mixed 3.x/PF1/PF2 screenshots | 16 | `data/monsters/legacy-creatures.yaml` |
| Monstrous-spider age table | 12 | `data/monsters/legacy-spiders.yaml` |
| PF1 goblin, three brute sizes and three linked goblin variants | 7 | `data/monsters/goblin-variants.yaml` |
| Midgard Bestiary AGE, creature pages 2–51 | 51 | `data/monsters/midgard-converted.yaml` |

The AGE book has 50 creature pages; Deathcap Mycolid and Psilocybe Mycolid are separate blocks sharing one page. The Dogmole Juggernaut sidebar mentions an advancement template without a complete statblock; it is retained as a source hook in Dogmole rather than counted as a full published creature. The full linked goblin handout supplies Shark Goblin, Organ Goblin and Cactus Goblin.

The natural **Goblin Shark**, **Shark-Shifting Goblin** from AGE and **Sharkskin Goblin** from the goblin handout are three different creatures. Regional character roles use generic titles preserving their species and equipment, such as Dwarf Axe Siegebreaker, Minotaur Deckbreaker, Dragonkin Runestaff Envoy and Gearforged Legionnaire. Gender does not create extra variants.

## Rules conversion

| Source | Treatment |
| --- | --- |
| AGE | Health becomes HP. Natural Defense is fixed AC; natural Armor Rating becomes explicit physical reduction. Worn armor is replaced with a current item and does not also grant its old Armor Rating. Scores use `10 + 2 × rating`: Strength/DEX/CON directly, Cunning→INT, maximum of Perception/Willpower→WIS, Communication→CHA. A caster's chosen mental score also includes Magic via the maximum rating. Yards become feet at ×3, rounded to the nearest 5 ft. Stunts become actions, bonus actions or reactions with finite uses/recharge; Mana and recursive extra attacks are not imported. |
| D&D 3.x / PF1 | Numeric physical and mental scores, printed fixed HP, size and movement are retained where supplied. Absent mental scores are completed explicitly. BAB, CMB/CMD, size accuracy and Fortitude/Reflex/Will are replaced by current proficiency, ability-based attacks, six saves and current DCs. A printed natural-weapon damage modifier can remain an explicit creature exception. |
| PF2 | Six scores reconstruct each modifier with `10 + 2 × modifier`. Level-based accuracy/saves and MAP are removed; attacks use current proficiency and ability. Shark AC is source AC minus creature level. Their HP remain printed. Source level only seeds a provisional CR estimate. Two-action movement/attack packages consume one Varis action plus normal movement rather than two Varis actions or free movement. |
| 5e goblin handout | Most printed statistics remain. Missing poison duration and contradictory HP formulas are recorded and completed. Organ Goblin's drain has a maximum-HP floor of 1 and only counts actual HP damage from an unblocked strike. |

All challenge ratings in this batch are **provisional Varis encounter estimates**, including retained source CRs. Reconstruction and fixed creature exceptions are identified in each source panel; inferred scores are not represented as printed six-score arrays. The legacy YAML key `original_5e` is required by the existing monster editor/import format; every new panel explicitly identifies its actual `source_system`, including AGE, PF1, PF2 and 3.x.

Rested Block is Dexterity-derived plus actual current armor/shield Block. Natural hide and Armor Rating do not grant equipment training or extra Block. Trained Block checks include current proficiency and Protection; permitted armor/shields allow STR. Weapon conversions use current dice, reach, Reload, Overdraw, Bulk, Slow and DC modifiers. Two-handed loadouts state which shield defenses are lost. Ordinary strike Block DC is attack bonus +8, with explicit Greataxe DC+ and Greatsword DC+++ adjustments.

Attack riders require an unblocked strike; automatic and save-only effects cannot be Blocked. Source penetrating damage is not a universal Block bypass. Old thunder damage becomes sonic. Long legacy paralysis becomes current Stunned with repeat CON saves, because current Paralyzed forbids saves. Fixed one-turn paralysis ends automatically. Old STR drain becomes poison HP damage and Weakened; automatic death, permanent possession and unlimited spawning become bounded effects with recovery or escape procedures. No existing global condition is rewritten.

Daily uses recover in 24 hours; short rests take one day and long rests one week. Recharge rolls occur at the start of the creature's turn. Multi-body creatures share a turn/action budget; summons have duration, concentration, command and population limits. A creature reference does not create an ally automatically.

## Provenance and editing

Sources: [Midgard Bestiary AGE Volume 1](https://www.scribd.com/document/590183663/Midgard-Bestiary-AGE-Vol1), [Goblin Variants handout](https://www.scribd.com/document/698529612/Goblin-Variants-PDF-sp-check), and the user-supplied screenshots. These reference different publishers, editions and homebrew authors. Source attribution does not imply that their licenses are interchangeable or that their creatures are official Varis rules. The import stores mechanical facts and newly written conversions; it does not copy book artwork or bulk lore prose.

Each block contains its source system/reference, original numerical facts, score status, completion fields and conversion decisions in the existing collapsed source panel. `data/monsters/source/cross-system-index.json` maps every new public name, source identity, page and theme. The four YAML collections are canonical editable content; normal website editing and targeted `custom.yaml` overrides work as for the existing monsters. Physical source collections are independent of the encounter themes used in browsing.

## Profile inventory

| Creature | Source | Primary theme |
| --- | --- | --- |
| Froghemoth | 3.x homebrew / PFSRD-labelled screenshot | Forests & wilds |
| Gray Ooze | Pathfinder 1e | Caverns & lost ruins |
| Crystal Ooze | Pathfinder 1e | Seas & coasts |
| Id Ooze | Pathfinder 1e | Caverns & lost ruins |
| Goblin Shark | Pathfinder 2e / Howl of the Wild | Seas & coasts |
| Great White Shark | Pathfinder 2e / Monster Core | Seas & coasts |
| Brain Mole | D&D 3e SRD | Caverns & lost ruins |
| Crystal Abomination | D&D 3.5 homebrew | Earth & crystal realms |
| Slag Worm | Pathfinder 1e | Fire, storms & sky |
| Borogon | D&D 3.5 homebrew | Forests & wilds |
| Frost Salamander | D&D 3e / Monster Manual II | Frozen wastes |
| Galeb Duhr | D&D 3e / Monster Manual II | Earth & crystal realms |
| Gambol | D&D 3e / Monster Manual II | Forests & wilds |
| Grizzly Mastodon | D&D 3e / Monster Manual II | Frozen wastes |
| Catoblepas | D&D 3e / Monster Manual II | Forests & wilds |
| Red Sundew | D&D 3e / Monster Manual II | Forests & wilds |
| Monstrous Spiderling | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Very Young Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Young Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Juvenile Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Young Adult Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Adult Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Mature Adult Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Old Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Very Old Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Elder Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Ancient Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Archaic Monstrous Spider | D&D 3.5 homebrew / age progression table | Forests & wilds |
| Goblin | Pathfinder 1e | Orc & gnoll warbands |
| Small Greataxe Goblin Brute | D&D 3.5 homebrew | Orc & gnoll warbands |
| Greatsword Goblin Brute | D&D 3.5 homebrew | Orc & gnoll warbands |
| Greatclub Goblin Brute | D&D 3.5 homebrew | Orc & gnoll warbands |
| Sharkskin Goblin | D&D 5e homebrew | Seas & coasts |
| Organ Goblin | D&D 5e homebrew | Eldritch nightmares |
| Cactus Goblin | D&D 5e homebrew | Deserts & canyons |
| Ala | AGE, p. 2; Ala | Fire, storms & sky |
| Alseid Hunter | AGE, p. 3; Alseid Hunter | Forests & wilds |
| Feyblade Exile | AGE, p. 4; Arbonesse Exile | Forests & wilds |
| Wasteland Magister | AGE, p. 5; Bemmean Wizard | Cults, mages & dark bargains |
| Bone Collective | AGE, p. 6; Bone Collective | Tombs & restless dead |
| Bone Crab | AGE, p. 7; Bone Crab | Seas & coasts |
| Bonepowder Ghoul | AGE, p. 8; Bonepowder Ghoul | Tombs & restless dead |
| Carrion Beetle | AGE, p. 9; Carrion Beetle | Caverns & lost ruins |
| Young Cave Dragon | AGE, p. 10; Cave Dragon, Young | Dragons & their lairs |
| Cavelight Moss | AGE, p. 11; Cavelight Moss | Caverns & lost ruins |
| Clockwork Hound | AGE, p. 12; Clockwork Hound | Constructs & workshops |
| Clockwork Myrmidon | AGE, p. 13; Clockwork Myrmidon | Constructs & workshops |
| Crag Drake | AGE, p. 14; Crag Drake | Earth & crystal realms |
| Death Butterfly Swarm | AGE, p. 15; Death Butterfly Swarm | Forests & wilds |
| Derro Fetal Savant | AGE, p. 16; Derro Fetal Savant | Eldritch nightmares |
| Dogmole | AGE, p. 17; Dogmole | Caverns & lost ruins |
| Dust Goblin Scavenger | AGE, p. 18; Dust Goblin Scavenger | Deserts & canyons |
| Eel Hound | AGE, p. 19; Eel Hound | Seas & coasts |
| Eye Golem | AGE, p. 20; Eye Golem | Constructs & workshops |
| Fellforged | AGE, p. 21; Fellforged | Constructs & workshops |
| Firegeist | AGE, p. 22; Firegeist | Fire, storms & sky |
| Dwarf Axe Siegebreaker | AGE, p. 23; Free Canton Siegebreaker | Cities, guards & outlaws |
| Ghost Knight | AGE, p. 24; Ghost Knight of Morgau | Tombs & restless dead |
| Gilded Devil | AGE, p. 25; Gilded Devil | Infernal invasions |
| Shark-Shifting Goblin | AGE, p. 26; Goblin Shark | Seas & coasts |
| Gypsosphinx | AGE, p. 27; Gypsosphinx | Deserts & canyons |
| Veiled Poison Assassin | AGE, p. 28; Harem Assassin | Cities, guards & outlaws |
| Imperial Ghast | AGE, p. 29; Imperial Ghast | Tombs & restless dead |
| Iron Ghoul | AGE, p. 30; Iron Ghoul | Tombs & restless dead |
| Kobold Slyblade | AGE, p. 31; Kobold Slyblade | Cities, guards & outlaws |
| Minotaur Deckbreaker | AGE, p. 32; Kyprion Deckclearer | Seas & coasts |
| Lich Hound | AGE, p. 33; Lich Hound | Tombs & restless dead |
| Lorelei | AGE, p. 34; Lorelei | Seas & coasts |
| Merrow | AGE, p. 35; Merrow | Seas & coasts |
| Dragonkin Runestaff Envoy | AGE, p. 36; Mharoti Emissary | Cults, mages & dark bargains |
| Mindrot Thrall | AGE, p. 37; Mindrot Thrall | Eldritch nightmares |
| Deathcap Mycolid | AGE, p. 38; Mycolid | Caverns & lost ruins |
| Psilocybe Mycolid | AGE, p. 38; Mycolid | Caverns & lost ruins |
| Necrophagus Ghoul | AGE, p. 39; Necrophagus Ghoul | Tombs & restless dead |
| Infernal Gnome Enchanter | AGE, p. 40; Niemheim Enchanter | Infernal invasions |
| Putrid Haunt | AGE, p. 41; Putrid Haunt | Forests & wilds |
| Centaur Lance Roughneck | AGE, p. 42; Rhoetian Roughneck | Cities, guards & outlaws |
| Roachling | AGE, p. 43; Roachling | Caverns & lost ruins |
| Sap Demon | AGE, p. 44; Sap Demon | Forests & wilds |
| Shield-and-Spear Sellsword | AGE, p. 45; Septime Sellsword | Cities, guards & outlaws |
| Shadow Fey Courtier | AGE, p. 46; Shadow Fey Courtier | Forests & wilds |
| Spark | AGE, p. 47; Spark | Fire, storms & sky |
| Steam Golem | AGE, p. 48; Steam Golem | Constructs & workshops |
| Weaving Spider | AGE, p. 49; Weaving Spider | Constructs & workshops |
| Wharfling Swarm | AGE, p. 50; Wharfling Swarm | Seas & coasts |
| Gearforged Legionnaire | AGE, p. 51; Zobeck Legionnaire | Constructs & workshops |
