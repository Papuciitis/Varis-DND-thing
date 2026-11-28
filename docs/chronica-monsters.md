# Chronica creature import

All 66 entities in the campaign export's 14 enemy, creature, guard and mercenary folders are included in `data/monsters/chronica.yaml`. Blank named NPC records are included with identified existing statblocks. Folder names and campaign names remain searchable. The source misspelling **Darkscale Cave Stalker** is retained.

The sanitized source snapshot is `data/monsters/source/chronica-monsters.json`. It contains creature descriptions, notes and original stat fields, with unrelated campaign metadata omitted. The full original JSON remains the user's source file.

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/import_chronica_monsters.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_chronica_monsters.py
```

`chronica-fills.json` stores identified existing fallback statblocks. `chronica-review.json` stores reviewed repairs to incomplete abilities and the sources used. These files make the conversion repeatable; edit the source manifest or review file before regenerating. Routine webpage edits should use the monster editor's custom YAML file instead, so regeneration preserves them.

## Existing alternatives for missing blocks

| Campaign creature | Existing alternative | Applied fields |
| --- | --- | --- |
| The Gray Orc male | SRD Orc | Missing combat block |
| Wild Man barbarian | SRD Berserker | Missing combat block |
| Elftaur female druid | SRD Druid | Missing combat block |
| Tiefling female sorcerer leader | SRD Mage | Missing combat block; the published Intelligence casting is retained as an explicit stand-in |
| Leonin male (rogue/assasin) | SRD Spy | Missing combat block |
| Sand shifter female | SRD Scout | Missing combat block |
| Forest child female leader | SRD Druid | Missing combat block |
| Formicid male | SRD Guard | Missing combat block |
| Ishilb male paladin | SRD Knight | Missing combat block; a martial stand-in |
| Imp | SRD Imp | Missing AC, HP and speed; campaign abilities and attacks retained |
| Raguch the Orc-Ogre Brute | SRD Ogre | Missing attacks; campaign defenses and modifiers retained |

These substitutions identify complete published alternatives. They do not invent racial mechanics for named campaign ancestries. Other omitted trait details use existing supplied creature abilities or identified published rules, recorded on the individual monster.

## Conversion decisions

Chronica's original six ability fields contain **modifiers**, including values such as `+1` and `-3`. The playable blocks now use six numerical scores. Thirty-eight profiles use sourced scores: 22 matching published profiles, seven explicitly identified compatible donor profiles, and nine complete SRD stand-ins for otherwise blank records. The remaining 28 use user-authorized reconstruction: choose the lower score that produces the recorded modifier, with a minimum score of 1. Every recorded modifier is checked against the resulting score; combat modifiers are preserved.

Reconstructed blocks show **Reconstructed scores**. Every profile records its method, donor or reconstruction note, and original modifiers in `source_ability_scores`; the untouched source values remain in `original_5e`. A compatible donor is an identified replacement, not a claim that the unknown original exact score was recovered. The two score manifests are `chronica-profiles.json` and `chronica-score-research.json`.

Printed senses and languages are promoted from source notes into ordinary stat fields. Known size, creature type and alignment are extracted from the source or selected published profile. Without a recorded Perception skill, an untrained passive Perception default is explicitly identified rather than granting proficiency. Unprovided languages remain **Not recorded** and unknown challenge remains **Unrated**, separate from CR 0. An ability-only compatible donor does not grant its challenge rating.

Source AC, HP, speed and attack modifiers remain fixed creature statistics. Block is added from the recorded Dexterity modifier, with explicitly identified current armor Block and Protection where equipment is supplied. Natural armor grants neither armor training nor extra Block. Ordinary attacks identify their Block DC; damage and attached attack riders require an unblocked strike. Saving-throw-only effects do not use Block.

Current Vara conditions apply: imported frightened uses **Afraid**, restrained uses **Pinned**, and exhaustion uses **Fatigue**. Printed DCs, durations and escape procedures remain specific creature rules. A repeated save expressly granted by a paralysis ability remains available even though the general Paralyzed condition prevents ordinary saves.

Named spells use identified current compendium alternatives. The converted rule text appears directly in the creature's action or feature. Original 5e spell text and dice remain in `original_5e`. Spellcasting stand-ins retain their published finite slots and casting modifiers; listed spells are regrouped by the current replacement spell's level. This is an NPC resource block, not an assertion that it follows the current player class's progression.

Physical attacks annotated `(2x)` keep their repeated attacks. Spell annotations such as **Burning Hands (4x)** remain use counts and never grant four castings in one action. Source per-day limits remain per-day, recharge dice remain recharge dice, and explicit short/long rest recovery uses Vara's default one-day short rest and one-week long rest.

Source CRs are encounter references. Substitution and conversion change encounter strength, so an inherited CR is not a new balance calculation.

## Sources

Published fallback blocks and standard monster abilities were checked against the official [2014 Basic Rules monster chapter](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters) and its alphabetic creature sections. The reusable material is also in [SRD 5.1](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf). Individual source URLs appear in the fallback and review manifests.

The Unborn Death Colossus's incomplete Summon Graveworm Colossus uses the existing [SpiralWorlds Unborn Death Colossus](https://spiralworlds.com/bestiary/undead/atropal/) summoning alternative: one Graveworm Colossus under its command for up to one hour. The campaign's range and Recharge 6 remain. This is an identified third-party alternative.

Current rules and spell alternatives are taken from the existing repository YAML. Original campaign material is retained as supplied.

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
