# Creature conversion and completion

87 added profiles bring the manual from 215 to **302 creatures** across 15 encounter themes. All 439 current player spells remain available. These entries grant no new player spells, class features or magic items.

| Creature collection | Profiles | Editable file |
| --- | ---: | --- |
| Beasts, oozes, aberrations and other creatures | 17 | `data/monsters/legacy-creatures.yaml` |
| Monstrous-spider ages | 12 | `data/monsters/legacy-spiders.yaml` |
| Goblin encounter variants | 7 | `data/monsters/goblin-variants.yaml` |
| Setting creatures | 51 | `data/monsters/setting-creatures.yaml` |

The setting collection covers 50 creature pages, including two separate fungal guardians on one page. The later armored-beast image supplies the complete **Burrow Hound Juggernaut**, a separate CR 6 creature with patchwork barding, powerful build, soft-earth tunnelling, ferocity and a bounded worm-hunting frenzy.

The natural Goblin Shark, Shark-Shifting Goblin and Sharkskin Goblin remain distinct. Creature titles use species, anatomy, role or equipment. Original identities and stable IDs support saved edits and traceable numerical fields.

## Conversion rules

All playable blocks use current Varis proficiency, attacks, saves, Block, equipment, conditions and action costs. Incompatible old accuracy bonuses, size adjustments and extra-action economies are replaced explicitly.

Where a reference supplies eight ability ratings, six-score reconstruction uses `10 + 2 × rating`: Strength/DEX/CON directly, Cunning for INT, maximum Perception/Willpower for WIS and Communication for CHA. A caster's chosen mental ability also includes the higher Magic rating. Modifier-only arrays reconstruct with `10 + 2 × modifier`. These scores are marked as reconstructed, with the exact calculation in their numerical notes. Supplied six-score arrays stay intact.

Printed HP and movement are retained where compatible. Yard distances convert at three feet per yard, rounded to five-foot increments; missing or adjusted distances are documented. Level-based defenses and accuracy are converted before choosing an encounter estimate. Natural protection does not grant equipment training or extra Block. Worn armor uses current Bulk, Slow, Protection, Reduction and Block; its old defensive rating is not added again.

Ordinary attacks show Block DC equal to attack bonus +8, with explicit weapon or creature adjustments. Current weapon dice, Reload, reach, Overdraw, Greataxe DC+ and Greatsword DC+++ apply. Two-handed loadouts identify shield defenses lost while using them. Attack riders require an unblocked strike. Save-only and automatic damage cannot be Blocked.

Long paralysis effects use Stunned with CON recovery saves; fixed one-turn Paralyzed effects end automatically because Paralyzed creatures cannot make saves. Ability drain becomes explicit damage and recoverable conditions. Old automatic death and unlimited possession become bounded effects with counterplay. Multi-body creatures share a turn budget. Summoned creatures have duration, concentration, command and population limits and reference independent monster profiles.

Daily uses recover after 24 hours; short rests take one day and long rests one week. Recharge rolls occur at the start of the creature's turn. Temporary Block does not stack. Existing global rules are unchanged.

## Completed challenge profiles

| Creature | CR | Basis |
| --- | ---: | --- |
| Burrow Hound Juggernaut | 6 | HP 85, armored hide, three natural attacks, finite ferocity and frenzy. |
| Infernal Portal | 12 | Encounter-hazard estimate for a three-round reference encounter using its existing arrival rules; longer operation changes difficulty. |
| Stoneform Duplicate | 1 | Complete standard stone body using a Boulder Guardian model with half HP and shared finite resources. |
| Stone illusion duplicate | 0 | Complete harmless one-HP decoy; cannot attack or cast spells. |

Every current creature has a numeric CR. These are encounter estimates to refine in play. A duplicate configured from another model records that model and its own challenge; its default CR must not be applied to a stronger copied body. Optional modelling never creates a creature, grants control, duplicates resources or adds independent concentration.

## Editing and numerical notes

The four YAML collections and normal `custom.yaml` overrides remain editable. The historical `original_5e` field is retained for file compatibility and contains provided numerical facts; it is not a claim that every reference used the same rules. Completed fields, score reconstruction, current replacements and neutral reference categories appear in collapsed notes.

The reference inventory is `data/monsters/source/cross-system-index.json`. [Reference material 1](https://www.scribd.com/document/590183663), [reference material 2](https://www.scribd.com/document/698529612), and the supplied images provide the numerical inputs. The compendium uses newly written descriptions and conversions; images and bulk descriptive prose are not imported.

## Profile inventory

| Creature | Reference category | Primary theme |
| --- | --- | --- |
| Adhesive Bog Colossus | Legacy d20 homebrew | Forests & wilds |
| Gray Ooze | Legacy d20 | Caverns & lost ruins |
| Crystal Ooze | Legacy d20 | Seas & coasts |
| Id Ooze | Legacy d20 | Caverns & lost ruins |
| Goblin Shark | Level-based d20 / aquatic reference | Seas & coasts |
| Great White Shark | Level-based d20 / creature reference | Seas & coasts |
| Mindleech Mole | Legacy d20 reference | Caverns & lost ruins |
| Crystal Abomination | Legacy d20 homebrew | Earth & crystal realms |
| Slag Worm | Legacy d20 | Fire, storms & sky |
| Spineback Devourer | Legacy d20 homebrew | Forests & wilds |
| Frost Salamander | Legacy d20 / creature reference volume 2 | Frozen wastes |
| Boulder Hermit | Legacy d20 / creature reference volume 2 | Earth & crystal realms |
| Bounding Jungle Predator | Legacy d20 / creature reference volume 2 | Forests & wilds |
| Grizzly Mastodon | Legacy d20 / creature reference volume 2 | Frozen wastes |
| Catoblepas | Legacy d20 / creature reference volume 2 | Forests & wilds |
| Red Sundew | Legacy d20 / creature reference volume 2 | Forests & wilds |
| Monstrous Spiderling | Legacy d20 homebrew / age progression table | Forests & wilds |
| Very Young Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Young Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Juvenile Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Young Adult Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Adult Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Mature Adult Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Old Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Very Old Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Elder Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Ancient Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Archaic Monstrous Spider | Legacy d20 homebrew / age progression table | Forests & wilds |
| Goblin | Legacy d20 | Orc & gnoll warbands |
| Small Greataxe Goblin Brute | Legacy d20 homebrew | Orc & gnoll warbands |
| Greatsword Goblin Brute | Legacy d20 homebrew | Orc & gnoll warbands |
| Greatclub Goblin Brute | Legacy d20 homebrew | Orc & gnoll warbands |
| Sharkskin Goblin | Six-score homebrew | Seas & coasts |
| Organ Goblin | Six-score homebrew | Eldritch nightmares |
| Cactus Goblin | Six-score homebrew | Deserts & canyons |
| Stormcloud Devourer | Creature reference, p. 2 | Fire, storms & sky |
| Antlered Forest Hunter | Creature reference, p. 3 | Forests & wilds |
| Feyblade Exile | Creature reference, p. 4 | Forests & wilds |
| Wasteland Magister | Creature reference, p. 5 | Cults, mages & dark bargains |
| Bone Swarm Exarch | Creature reference, p. 6 | Tombs & restless dead |
| Bone Crab | Creature reference, p. 7 | Seas & coasts |
| Grave Dust Ghoul | Creature reference, p. 8 | Tombs & restless dead |
| Carrion Beetle | Creature reference, p. 9 | Caverns & lost ruins |
| Young Cave Dragon | Creature reference, p. 10 | Dragons & their lairs |
| Luminous Strangler Moss | Creature reference, p. 11 | Caverns & lost ruins |
| Clockwork Hound | Creature reference, p. 12 | Constructs & workshops |
| Flamejet Clockwork Sentinel | Creature reference, p. 13 | Constructs & workshops |
| Crag Drake | Creature reference, p. 14 | Earth & crystal realms |
| Death Butterfly Swarm | Creature reference, p. 15 | Forests & wilds |
| Caged Mind Savant | Creature reference, p. 16 | Eldritch nightmares |
| Burrow Hound | Creature reference, p. 17 | Caverns & lost ruins |
| Dust Goblin Scavenger | Creature reference, p. 18 | Deserts & canyons |
| Eel Hound | Creature reference, p. 19 | Seas & coasts |
| Eye Golem | Creature reference, p. 20 | Constructs & workshops |
| Wraithbound Automaton | Creature reference, p. 21 | Constructs & workshops |
| Ember Wisp | Creature reference, p. 22 | Fire, storms & sky |
| Dwarf Axe Siegebreaker | Creature reference, p. 23 | Cities, guards & outlaws |
| Ghost Knight | Creature reference, p. 24 | Tombs & restless dead |
| Gilded Devil | Creature reference, p. 25 | Infernal invasions |
| Shark-Shifting Goblin | Creature reference, p. 26 | Seas & coasts |
| Vulture Sphinx | Creature reference, p. 27 | Deserts & canyons |
| Veiled Poison Assassin | Creature reference, p. 28 | Cities, guards & outlaws |
| Frenzied Spear Ghast | Creature reference, p. 29 | Tombs & restless dead |
| Plateclad Ghoul | Creature reference, p. 30 | Tombs & restless dead |
| Kobold Ambusher | Creature reference, p. 31 | Cities, guards & outlaws |
| Minotaur Deckbreaker | Creature reference, p. 32 | Seas & coasts |
| Grave Hunting Hound | Creature reference, p. 33 | Tombs & restless dead |
| River Lure Spirit | Creature reference, p. 34 | Seas & coasts |
| River Troll | Creature reference, p. 35 | Seas & coasts |
| Dragonkin Runestaff Envoy | Creature reference, p. 36 | Cults, mages & dark bargains |
| Sporebound Thrall | Creature reference, p. 37 | Eldritch nightmares |
| Deathcap Fungal Guardian | Creature reference, p. 38 | Caverns & lost ruins |
| Hallucinogenic Fungal Guardian | Creature reference, p. 38 | Caverns & lost ruins |
| Ghoul Necromancer | Creature reference, p. 39 | Tombs & restless dead |
| Infernal Gnome Enchanter | Creature reference, p. 40 | Infernal invasions |
| Putrid Haunt | Creature reference, p. 41 | Forests & wilds |
| Centaur Lance Roughneck | Creature reference, p. 42 | Cities, guards & outlaws |
| Cockroach Folk Scavenger | Creature reference, p. 43 | Caverns & lost ruins |
| Sap Demon | Creature reference, p. 44 | Forests & wilds |
| Shield-and-Spear Sellsword | Creature reference, p. 45 | Cities, guards & outlaws |
| Shadow Fey Courtier | Creature reference, p. 46 | Forests & wilds |
| Lightning Mote | Creature reference, p. 47 | Fire, storms & sky |
| Steam Golem | Creature reference, p. 48 | Constructs & workshops |
| Weaving Spider | Creature reference, p. 49 | Constructs & workshops |
| Shore Scavenger Swarm | Creature reference, p. 50 | Seas & coasts |
| Clockwork Legionnaire | Creature reference, p. 51 | Constructs & workshops |
| Burrow Hound Juggernaut | Legacy d20 | Caverns & lost ruins |
