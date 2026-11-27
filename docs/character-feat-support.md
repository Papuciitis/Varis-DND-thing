# Character feat and progression support

Reviewed all 156 current feats against the compiled Git rules. This is the implementation audit for the character creator; full rules remain in the compendium. Conditional controls appear after their parent choice, so the table lists the initial controls.

## Applied changes

The builder stores choices per feat grant, applies supported ability/skill/proficiency, HP, rest-dice, save-slot, initiative, speed and casting-capacity changes, and expands the supported class-choice lists. Repeatable feats retain separate decisions and later-tier requirements. Removing a grant deactivates its effects without deleting its stored choices.

Extra spell-list upgrades share the same pool as level-granted upgrades and obey each option's repeat limit. Explicit permanent class/feature upgrades can target known cantrips or hexes; temporary, ritual, equipment-bound and custom-effect changes remain conditional source rules.

Named feat/ancestry spells remain separate from the class learning allowance and retain their casting ability. Automatic casting is limited to a supported, explicit resource path; the other action is labelled to resolve the granting rule's costs and limits. Random HP/fatigue costs, once-per-rest limits, special transformations, summoned creatures, per-round changes, potion effects, and combat triggers still need the player to resolve their rule text. The app does not simulate every feat's active power. Existing manual AP, Ki, battle-dice and similar counters remain manual.

Mana-refusal records the actual sacrificed spells and the historical cantrip-upgrade count; level-ups do not enlarge that sacrifice's allowance. The selected spells are retained for provenance and cannot be cast. Meta-break decisions are attached to their chosen target; chance and duration rolls follow the printed rule rather than being applied globally.

## Level progression

The source metadata separates automatic cantrip improvements from selectable upgrades and records their individual level schedules. Level-down deactivates later choices; restoring the level restores valid saved picks. Learned hexes receive upgrade choices only from an explicit granting rule. Class slots, known-spell/cantrip counts, HP, proficiency, supported recurring feature grants, ancestry milestones, selected rest-dice and Metamagic-capacity improvements continue to follow their own sources. Explicit level-dependent clauses are also available on Review.

Spell level and character level are distinct. Call order's explicit spell-level improvements follow the casting selector. Other spell dice, areas, durations and upcast effects remain governed by the full spell rules.

## Feat audit

| Feat | Initial follow-up controls |
| --- | --- |
| Bolt-stacking | Maintained personal crossbow; Crossbow benefit |
| Deeper focus | No permanent follow-up choice |
| Doctor | No permanent follow-up choice |
| Enhanced spell recovery | No permanent follow-up choice |
| Eviscerate | No permanent follow-up choice |
| Exert + | No permanent follow-up choice |
| Expanded metamagic | Additional metamagic effects (use the base Sorcerer list) |
| Expanded alchemy | No permanent follow-up choice |
| Extra battle dice | No permanent follow-up choice |
| Extra combat art | Ability score +1 |
| Extra fighting skills | Ability score +1 |
| Extra insight | Ability score +1 |
| Extra occult casting | Ability score +1 |
| Extra Ranger training | Ability score +1 |
| Extra talent spell | No permanent follow-up choice |
| Extra tricks of the trade | Ability score +1 |
| Extreme training | Ability score +1; Lose a skill proficiency; Skill to improve to expertise; Tool expertise (optional) |
| Flurry of blows | No permanent follow-up choice |
| Fool's luck | No permanent follow-up choice |
| Great warrior | Affected ability or spell |
| Greater summoning | No permanent follow-up choice |
| Hermeticism | No permanent follow-up choice |
| Hex casting | Hex grant |
| Honed Strength | No permanent follow-up choice |
| Ice magic | No permanent follow-up choice |
| Inspirational | No permanent follow-up choice |
| Invoke dark powers | Granted cantrip |
| Lunge | Ability score +1 |
| Meta-break: Longer | Ability score +1; Affected ability or spell |
| Meta-break: More uses | Ability score +1; Affected ability or spell |
| Meta-break: Greater chance | Ability score +1; Affected ability or spell; Chance improvement |
| More oath spells known | Table ruling: number of extra spells |
| More occult spells known | Table ruling: number of extra spells; Casting ability |
| More mystic spells known | Table ruling: number of extra spells; Casting ability |
| Oathbound | Ability score +1; Cleric oath (blessing only) |
| Oaths of might | No permanent follow-up choice |
| Occult gnosis | No permanent follow-up choice |
| Occultist knowledge | Additional benefit |
| Offering | No permanent follow-up choice |
| Offensive magic | Ability score +1; Spell or cantrip; Improve |
| Quick throw | No permanent follow-up choice |
| Scavenger | No permanent follow-up choice |
| Second wind + | Ability score +1 |
| Seize the day | Ability score +1 |
| Slap sense into people | No permanent follow-up choice |
| Stable magic | Spell or cantrip |
| Templar's might | No permanent follow-up choice |
| Trigger happy | No permanent follow-up choice |
| Toxomancy | Spell or cantrip |
| Violent magic | Spell or cantrip; Remove component |
| Wand training | Ability score +1 |
| Weapon technique | Named maneuvers |
| Witching hour | No permanent follow-up choice |
| Arcane ritual circle | No permanent follow-up choice |
| Armor proficiency | No permanent follow-up choice |
| Blood-memories | No permanent follow-up choice |
| Bowmanship | No permanent follow-up choice |
| Child of Og | No permanent follow-up choice |
| Combat experience | No permanent follow-up choice |
| Craftsmanship | No permanent follow-up choice |
| Critical healing | No permanent follow-up choice |
| Dark enlightenment | No permanent follow-up choice |
| Deadeye shot | No permanent follow-up choice |
| Dragons breath mastery | No permanent follow-up choice |
| Dwarven artifice | No permanent follow-up choice |
| Dwarven veteran | Weapon group |
| Improved sneak attack | No permanent follow-up choice |
| Dual wielding | Choose an upgrade; Ability score +1 |
| Elven power | Ability score +1 |
| Expertise | Skill to improve to expertise; Tool expertise (optional) |
| Extra cantrip upgrade | Ability score +1; Cantrip to upgrade |
| Extreme critical | No permanent follow-up choice |
| Fae luck | No permanent follow-up choice |
| Firbolg spiritsong | Spiritsong grant; Casting skill |
| Flight feathers | No permanent follow-up choice |
| Infernal magic | Cantrip to upgrade; Occult spell, level 1; Occult spell, level 2; Occult spell, level 3 |
| Forbidden magic | Occult spell |
| Great determination | Ability score +1 |
| Grit | No permanent follow-up choice |
| Grudgebearer | Current grudge (optional) |
| Guts of steel | No permanent follow-up choice |
| Hand to hand combat | Ability score +1 |
| Rite magic | Choose an upgrade |
| Herbology | Choose an upgrade |
| Rune circle | No permanent follow-up choice |
| Necromantic circle | No permanent follow-up choice |
| Hardened scales | No permanent follow-up choice |
| Heavy wielding | Ability score +1 |
| Innate magic | Ability score +1; Granted cantrip; Cantrip casting ability |
| Improved cleave | No permanent follow-up choice |
| Iron will | No permanent follow-up choice |
| Lifeforce | No permanent follow-up choice |
| Madness magick | No permanent follow-up choice |
| Farsight | No permanent follow-up choice |
| Cave explorer | No permanent follow-up choice |
| Mana-refusal | Permanently sacrificed cantrip; Upgrades the cantrip had when sacrificed; Mana-refusal upgrades |
| Mastered maneuver | Named maneuver |
| Moon-blood | No permanent follow-up choice |
| More upgrades | Two different upgrade lists |
| Mind palace | No permanent follow-up choice |
| Mixed elemental descendant | Ability score +1; Additional Ginasi lineage; Proficiency type |
| Mutant kobold | Choose an upgrade |
| Overpower | No permanent follow-up choice |
| primordial-soul | No permanent follow-up choice |
| Dirty kick | No permanent follow-up choice |
| Pilgrims cantrip | No permanent follow-up choice |
| High metabolism | Ability score +1 |
| Veil-magic | Cantrip; 1st-level spells; 3rd-level spell |
| Thick skull | No permanent follow-up choice |
| Volition | No permanent follow-up choice |
| Adrenaline rush | No permanent follow-up choice |
| Bloody talons | No permanent follow-up choice |
| Rapid reload | No permanent follow-up choice |
| Resolve | No permanent follow-up choice |
| Retrain | Move +1 from; Move +1 to; Additional +1 to a different score; Proficiency type |
| Shield proficiency | No permanent follow-up choice |
| Elemental sigils | Element |
| Skilled | Ability score +1; Two skill proficiencies |
| Swift | No permanent follow-up choice |
| Symbiosis | Three ability scores; Active adaptation |
| Tough | No permanent follow-up choice |
| Twitch reflexes | No permanent follow-up choice |
| Sprint | No permanent follow-up choice |
| Warcry | No permanent follow-up choice |
| weapon proficiency | Ability score +1; Two weapon groups |
| Wildspeech | No permanent follow-up choice |
| Waeld-soul | 2nd-level mystic or oath spells |
| Tiny frenzy | No permanent follow-up choice |
| Goblin mode | No permanent follow-up choice |
| Zeal | No permanent follow-up choice |
| Shield-brother | No permanent follow-up choice |
| Combat dice | No permanent follow-up choice |
| Rhetoric | No permanent follow-up choice |
| Battle scars | Qualifying battles already recorded |
| Odd bloodtype | No permanent follow-up choice |
| Righteousness | No permanent follow-up choice |
| Weapon prowess | Weapon group |
| Power attack | No permanent follow-up choice |
| Self-modification | No permanent follow-up choice |
| Living metal | No permanent follow-up choice |
| Power source | Choose an upgrade |
| Small infiltrator | No permanent follow-up choice |
| Warpath | Benefit |
| Will to power | No permanent follow-up choice |
| Latent power | Mystic cantrip; Granted spell; Casting method |
| Worldly | Three languages; Two skills for +1 |
| Mastery | No permanent follow-up choice |
| Sworn | Choose an upgrade; 1st-level oath spell; 2nd-level oath spell |
| Grimness | Choose an upgrade |
| Calculated angle | No permanent follow-up choice |
| Brute force | No permanent follow-up choice |
| Arcane insight | Choose an upgrade; Arcane cantrip; 1st-level arcane spell |
| Summoner specialization | No permanent follow-up choice |
| Extra attack | No permanent follow-up choice |
| Shielded mind | No permanent follow-up choice |
| Moment of glory | No permanent follow-up choice |

- Cryptic cyphers is an explicit exception to normal cantrip leveling. The feature records insights, unlocks its occult cantrip at three, grants one upgrade per three additional insights and caps that pool at five. It does not receive character-level choices or automatic level improvements. Manually added legacy spells have no provenance; choose the cantrip under this feature to bind that record to the insight progression.


## Occultist Mark & Reward

Both the level-one pair and optional later pairs must be complete before their mechanical effects activate. The resistance reward asks for two types; the damage reward records its permanent type; expertise offers already proficient skills; and the feat reward opens the eligible feat picker with ability-increasing feats excluded. Spell-attack penalties are reflected in casting. Subject-to-GM skill marks record their affected classification. The healing mark keeps its source text pending clarification of who receives or performs the reduced healing.
