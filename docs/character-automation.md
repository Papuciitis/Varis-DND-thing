# Authoring character choices and upgrades

New feats, backgrounds, ancestry traits, classes and archetypes can declare supported character mechanics in YAML. The compiler validates them and the character sheet uses one shared interpreter. No JavaScript registration by the new content's name is needed.

The declaration is separate from the readable rule. Keep the rule's costs, triggers, exceptions and examples in its description. A declaration automates only the supported operations it explicitly lists; it does not infer mechanics from new prose.

## Where declarations go

For a new feat or background, add `automation:` beside `description:` in its existing entry. For a class, archetype or race, a root declaration creates an automatic feature at the owner's starting level; `label` names that feature. Use conditions and level counts for later changes.

To attach mechanics to an existing feature or selected option without changing its readable source, add a record to `data/character-automation.yaml`:

```yaml
version: 1
rules:
  - entry: [classes, Base class, Bard]
    feature: Bardic traits
    level: 2
    group: Choose features
    option: Deep past
    mechanics:
      choices:
        - key: targets
          label: Owned list to extend
          type: upgrade-target
          targetMode: ancestry-or-feat
      grants:
        - from: targets
          count: 1
          ownerKey: source
```

The selector must resolve to exactly one source. `entry` is `[section, group, name]`; `feature`, its `level`, the choice `group` label and an `option` name narrow it down. Do not declare the same source both inline and in the sidecar.

## Example: a new upgrade list

This is an authoring example, not an added game rule:

```yaml
automation:
  prerequisites:
    all:
      - ability: wis
        minimum: 13
      - level: 3
  repeatLimit: 1
  choices:
    - key: upgrades
      label: Choose an upgrade
      type: select
      count: 1
      upgradeable: true
      options:
        - id: training
          name: Training
          effects:
            restDice: 1
        - id: practiced
          name: Practiced training
          requires: [training]
          repeatLimit: 2
          effects:
            skillBonuses:
              Insight: 1
```

`upgradeable: true` lets extra-upgrade grants target this field. `requires` names earlier option IDs in the same list. Each occurrence applies its option's effects, up to `repeatLimit`. Without a repeat permission, an option can be taken once.

## Choices and scaling

| Field | Meaning |
| --- | --- |
| `key` | Permanent storage key within the granting source. |
| `label` | Player-facing prompt. |
| `type` | `select`, `text`, `ability`, `skill`, `spell`, or `upgrade-target`. |
| `count` | Base picks; defaults to 1. Zero allows a list unlocked by another grant. |
| `countByLevel` | Ascending `{level, count}` steps that replace the base count. |
| `levelBasis` | `source` (default: owning class level for class/archetype features) or `character`. |
| `when` | Condition controlling whether the field is active. |
| `perChoice` | `{choice: parent-key, includes: option-id}` grants the base count for each active occurrence of that parent option. |
| `upgradeable` | Permits additional picks from the shared upgrade-grant system. |
| `optional` | Does not block completion when empty. |
| `repeat` | Allows repeated field answers; option-specific `repeatLimit` overrides it. |

`select` options have `id`, `name`, optional `details`, `requires`, `repeatLimit`, and `effects`. Details are shown with the selected answer. `ability` can restrict `abilities` to `str/dex/con/int/wis/cha`. `skill` can use `rankBelow` to limit training choices. `text` records a free-form answer.

Use `perChoice` when taking the same upgrade twice should produce two follow-ups, rather than one shared answer. Follow-ups inherit their parent pick's ownership, so removing the first extra pick keeps the second extra pick's answer attached to its own source.

```yaml
- key: learn
  label: Granted spell
  type: spell
  level: 1
  traditions: [arcane]
  perChoice: {choice: upgrades, includes: spell}
  grantSpell:
    ability: int
    resource: manual
```

The parent list must actually contain the `spell` option. `spell` choices filter by exact spell level (`0` for cantrips) and `arcane/mystic/oath/occult` tradition. `grantSpell` adds the chosen spell separately from the class learning budget. Its resource can be `manual`, `free`, or `restDice` (one die per spell level, with the existing manual alternative). Use `manual` for other costs, material damage, special limits or once-per-rest rules; those are not inferred.

## Conditions and prerequisites

Conditions support `all`, `any`, `not`, `{choice, includes}`, `{level, basis}`, `{ability, minimum}`, `{skill, rank}`, and `{class, level}`. A choice condition only reads active selections. Unknown parent keys and explicit option IDs fail validation. Field dependencies are ordered automatically; circular dependencies are rejected.

`prerequisites` uses the same condition format, except it cannot depend on the source's own answers. Feat prerequisites are checked at the level the feat was granted, using the existing chronological ability and training checks. Existing prose `requirements` also apply. Other automated sources with unmet prerequisites do not apply their declared effects or grants. For repeatable feat tiers, `repeatRequirements` retains the existing supported textual prerequisite syntax.

## Effects and proficiencies

`effects` can add a fixed supported effect, optionally gated by a condition, or map selected answers to a supported statistic:

```yaml
effects:
  - add: {hpFlat: 2}
    when: {level: 5}
  - target: abilities
    choice: ability
    amount: 1
  - target: proficiencies.tools
    choice: tool
proficiencies:
  armor: [light armor]
  tools: [a named tool]
```

Supported fixed scalar effects are `ac`, `block`, `combatBlock`, `blockCheck`, `dexBlock`, `hpFlat`, `hpPerLevel`, `restDice`, `speed`, `initiative`, `weaponAttack`, `weaponDamage`, `damage`, `spellAttack`, `spellSave`, `deathSaveSlots`, `deathSaveBonus`, `knownSpells`, `occultSlots`, `fullSlots`, `eachSlotLevel`, `metamagicMaximum`, `armorBulkReduction`, and `armorSlowReduction`.

Supported maps are `abilities`, `skills` (rank), `skillBonuses`, `saveBonuses`, `abilitySkillBonuses`, `slots`, and `reductions`. Supported lists are `resistances`, `immunities`, and `languages`. `offHandAbilityDamage` is boolean; `castingTradition` is a tradition name or `any`. Selected-answer effects support those maps and `proficiencies.armor/weapons/tools/languages`. Static `proficiencies` supports the same four training categories.

Class/archetype rest-dice effects follow their owning class's die pool. Other sources use the normal default pool. Declared effects replace the old name/prose adapter for that source, preventing double application. An unconditional `baseGrants`-only migration retains its existing passive adapter.

## Grants, including grants on grants

An `upgrade-target` choice offers owned lists. `targetMode: upgrades` includes declared upgradeable fields, existing supported class upgrade lists and known cantrip upgrade lists. The compatibility modes `ancestry-or-feat` and `earlier-archetype` implement Deep past and New tricks; the latter can name its base-class training feature with `baseFeature`.

```yaml
choices:
  - key: targets
    label: Lists to extend
    type: upgrade-target
    targetMode: upgrades
    count: 2
grants:
  - from: targets
    count: 1
```

For a fixed target, replace `from` with a `target` selector. A core group target uses `entry/feature/level/group`. A declared field target uses a source selector plus `choice: field-key`, for example:

```yaml
grants:
  - target:
      entry: [feats, '', A feat name]
      choice: upgrades
    count: 1
```

Grants can use `when`, `perChoice`, and `countByLevel`. They do not manufacture ownership of the target feature. If the target disappears, its choices and benefits stop applying.

`baseGrants` adds an unconditional later feature's allowance to an existing core group. It supports fixed counts and level counts, keeps the earlier group's saved IDs, and cannot have `when`, `perChoice`, or source prerequisites. Use `grants` for conditional mechanics.

To deliberately grant feats, use `featGrants` rather than treating a feat picker as an upgrade list:

```yaml
featGrants:
  - key: bonus-feat
    label: Bonus feat
    count: 1
    noAbilityIncrease: true
    when: {choice: upgrades, includes: training}
```

Feat grants use ordinary prerequisite-filtered feat selection. A granted feat may itself have choices or further grants. `perChoice` is also supported. Removing an ancestor removes the benefits of its whole dependent chain; stored inactive decisions survive restoration. Cyclic upgrade grants are rejected at compilation where references are fixed and ignored with an explanation when they arise from runtime target selections.

Multiple copies of a repeatable feat within one grant retain separate answer records. Each copy checks its tier's requirements. The no-ability-increase restriction also recognizes ability bonuses on declared upgrade options; an explicit `abilityIncrease` flag can classify a more complex rule.

Older duplicate feat copies within one picker shared a single answer record. The first normal slot keeps that ID; additional copies now request their own answers, since separate historical answers were never stored. Ordinary feat grants and the migrated upgrade fields retain their existing IDs.

## Save compatibility and validation

Choice `key`s, option `id`s, feat-grant `key`s and compiled source IDs are persistent identifiers. Keep them stable when editing labels or descriptions. Entry and feature names also participate in older compiled source IDs; renaming those sources requires a save migration. Do not use choice keys ending in `-sources`; those store the ownership ledger. Each independent grant retains its own answer positions. `ownerKey: source` is a compatibility setting used for migrated More upgrades/Deep past saves; new declarations should use the default grant ownership.

Run `python build.py` before checking the sheet or running JavaScript tests. It rejects unsupported operations, malformed values, duplicate IDs, missing references, cyclic choice prerequisites and fixed upgrade-grant cycles. The generated character metadata contains `automation.coverage` with `declared`, `manual` and `legacy` records for auditing. The coverage list is an implementation inventory, not a promise that every printed active power is simulated.

The initial migration covers eight explicit feat upgrade lists (Dual wielding, Mutant kobold, Rite magic, Herbology, Power source, Sworn, Grimness and Arcane insight), More upgrades, Deep past, New tricks and 27 later-feature list extensions. Existing saves keep their choice and spell IDs.

Older bespoke mechanics still have compatibility adapters. New kinds of action costs, temporary states, resource pools, transformations or combat triggers need interpreter support before they can be declared. Unknown operations fail the build. If a rule must remain manual, declare `automation: {manual: 'Explain what the player must resolve'}` and keep its full readable rules. This is explicit and cannot be mixed with automatic effects for the same source.

Validation for this migration: 182 Python checks, 441 JavaScript checks and the standard modular/portable site build passed. The new engine fixtures use unregistered content names and include twelve-level grant chains, repeated picks, source removal and saved-character round-trips.
