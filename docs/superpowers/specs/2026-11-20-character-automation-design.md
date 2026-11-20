# Character choices and automatic values

Extend the existing phone-first sheet so selecting ancestry, class, archetypes and feature options updates derived values, and equipping items supplies attacks and defence values. Keep the static Python/YAML build, local saves and JSON backups. The previous integration is merged as `d7090bc`; work on `codex/character-automation` in the same canonical repository.

## Model

Compile source-backed builder metadata from the existing catalog. Keep the original text accessible beside choices. A pure JavaScript rules engine calculates a view from base scores, manual adjustments, active selections and equipped items. It must not permanently add ancestry bonuses to base scores or duplicate generated features/attacks when selections change. Old manual sheets stay manual until a builder draft is saved. New saved builder data remains an extension of backup format 1.

Store selections under `character.build`: enabled, raceId, classId, archetypes (entry IDs in slot order), abilityChoices (mode and selected ability codes by choice ID), choices (option IDs by choice ID), skills (selected class skills), raceSkills, weaponGroups and health settings. Derive effective abilities, saves, trained skills, proficiencies, eligible feature text, passive effects, equipped attacks, AC, speed and Block. Keep manual features, attacks and bonuses separate. Never refill spent pools merely by rendering or equipping an item.

Support all catalog races/classes/archetypes in selectors. Restrict archetypes to their parent class and level. Display source gaps and draft contradictions, including incomplete archetypes. Show feature choices when their level is reached; preserve selections in backups and ignore stale or ineligible choices in calculations.

## Creation and level-up flow

New character opens a six-step wizard: Ancestry, Class, Abilities, Features, Equipment and Review. Ancestry includes identity, level and race. Class includes unlocked archetype slots. Abilities separates base scores from racial bonus allocations. Features presents source descriptions, trait and feature selections, and granted skill choices. Equipment provides the equipped-item preview. Review shows the derived sheet, HP method and unresolved selections before Save character.

The wizard edits an isolated draft. Moving between steps or changing equipment does not alter the saved sheet. Cancel discards the draft; Save character applies it and enables automatic derivation. Build character reopens this flow for an existing character, including level-up choices. Existing manual characters remain manual until a builder draft is saved. Preserve manual extra bonuses and attacks alongside derived values.

Automatically apply only supported fixed passive effects. Conditions such as wearing armor, wielding an attuned weapon, raging, darkness or expending a resource must remain in readable rule text unless explicitly modeled. Nested upgrades whose prerequisite selection is not implemented remain manual. Display incomplete source rules without inventing their missing mechanics.

## Equipment and health

One active armor and one active shield avoid undefined stacking. Equipping a replacement unequips the previous item of that category. Weapon attacks use current ability/proficiency and actual Vara properties: Agile, Balanced, Effort, Throw, Versatile, reach and DC notation. Preserve conditional maneuvers as readable rules. Provide item training, ability, off-hand, two-handed and magic-bonus controls where relevant. Do not substitute 5e armor/Dex formulas.

Armor AC follows both written clauses: max(8, base AC + max(0, Dexterity modifier - bulk) - max(0, bulk - Strength modifier)), then shield and explicit bonuses. Speed subtracts 5 times max(0, slow - Strength modifier). Protection contributes to Block checks. Rest restores the written Block pool; initiative raises remaining Block to the armor/shield combat floor rather than adding it every time. Temporary Block is spent first.

The user's authoritative health rules supplement the repository: level 1 HP is the maximum class hit die plus the Constitution modifier and other applicable modifiers. Later levels add a hit-die roll or average plus the Constitution modifier and applicable modifiers. Support fixed-average progression, recorded rolls and manual HP. A missing recorded roll uses the fixed average with a visible warning. Apply supported per-level HP modifiers to each level's gain, preserving explicit minimum gains, and add flat HP modifiers separately. Recalculating a maximum preserves existing wounds and never refills a pool.

The user specifies damage priority as Arcane Health, then Temporary HP, then HP. Automatic damage follows that order and spills remaining damage into the next pool. Preserve explicit manual pool targeting. Health controls show which pools change. Diseased healing is halved, rounded down to a minimum of zero.

Combat start raises remaining Block to the established armor/shield/feature floor rather than adding it on repeated use; treat Dexterity-derived Block, ordinary combat Block and temporary combat Block distinctly. Rest restores the written Block pool. A short rest removes Fatigue equal to Constitution modifier, minimum 1; a long rest removes all Fatigue. Generic HP restoration, rest-dice recovery and resistance rounding are not supplied by these clarifications and remain manual or explicitly configured. Ability-specific recovery, disease cures, costs and temporary effects still follow their source conditions.

## Verification and delivery

Use focused unit tests for derived values, selection changes, eligibility, equipment removal, damage/recovery and save round trips; retain all existing tests. Check actual desktop and phone layouts. Commit/push a new branch and open a reviewable PR after verification. Do not merge main automatically.
