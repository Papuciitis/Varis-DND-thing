"""Build the converted Tarta dragon collection from its immutable wiki snapshot.

Original core statistics and the four printed special-ability sets are retained.
Missing combat routines are explicit homebrew completions using the repository's
converted dragon conventions and the Homebrewery material themes.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import re

import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/monsters/source/tarta-wiki.json'
OUTPUT = ROOT / 'data/monsters/tarta-wiki.yaml'
NO_BLOCK = ' This saving-throw-only effect cannot be Blocked.'


def rule(name, description):
    return {'name': name, 'description': description}


def breath(name, shape, dc, ability, damage, rider=''):
    text = f'Exhale {shape}. Each creature in the area makes a DC {dc} {ability} save, taking {damage} damage on a failure, or half as much on a success.'
    if rider:
        text += ' ' + rider
    return rule(name + ' (Recharge 5-6)', text + NO_BLOCK + ' After use, roll 1d6 at the start of each of the dragon\'s turns; on 5 or 6, this breath recharges.')


def common_combat(entry):
    """Use the already-converted local dragon routine; source defense values stay fixed."""
    strength = (int(entry['abilities']['str']) - 10) // 2
    proficiency = 2 + (int(entry['cr']) - 1) // 4
    bonus = strength + proficiency
    large_scale = {'Huge': (2, 10, 5, 15, 10), 'Gargantuan': (3, 15, 10, 20, 15), 'Colossal': (4, 20, 15, 30, 30)}[entry['size']]
    dice, bite_reach, claw_reach, tail_reach, wing_radius = large_scale
    entry['proficiency_bonus'] = f'{proficiency:+d}'
    entry['traits'] = [
        rule('Legendary Resistance (3/day)', 'When it fails a saving throw, the dragon can choose to succeed instead. It has three uses per 24 hours; uses do not refresh each turn.'),
    ]
    entry['actions'] = [rule('Multiattack', 'Make one Bite attack and two Claw attacks. Each attack has its own attack roll and opportunity to Block.')]
    for name, die, reach, damage_type in [('Bite', 10, bite_reach, 'piercing'), ('Claw', 6, claw_reach, 'slashing'), ('Tail', 8, tail_reach, 'bludgeoning')]:
        entry['actions'].append(rule(name, f'Melee attack: {bonus:+d} to hit, reach {reach} ft., one target; Block DC {bonus + 8}. Unblocked strike: {dice}d{die} + {strength} {damage_type} damage.'))
    entry['legendary_actions'] = [
        rule('Legendary action pool', 'The dragon has 3 legendary actions. At the end of another creature\'s turn, it can use one listed option and pay its cost. Use only one option at a time. It regains all spent legendary actions at the start of its own turn. These do not consume its action, bonus action or reaction.'),
        rule('Detect (1 action)', 'Make a Wisdom (Perception) check.'),
        rule('Tail Attack (1 action)', 'Make one Tail attack using its printed attack bonus, reach, Block DC and unblocked-strike damage.'),
        rule('Wing Attack (2 actions)', f'Each other creature within {wing_radius} feet makes a DC {bonus + 8} Dexterity save. On a failure, it takes {dice}d6 + {strength} bludgeoning damage and falls Prone. On a success, it takes no damage and does not fall Prone. The dragon may then fly up to half its flying speed.' + NO_BLOCK),
    ]
    entry['conversion_notes'].append(f'Homebrew completion: one Bite and two Claws, separate Tail, three legendary actions, Detect/Tail/Wing costs, and 3/day Legendary Resistance follow data/monsters/template.yaml / Adult Red Dragon and data/monsters/steel-dragons.yaml. Attack bonus uses printed Strength modifier plus proficiency {proficiency:+d}; ordinary Block DC is attack bonus + 8. Huge attacks use 2 dice, Gargantuan 3 and Colossal 4, an explicit size scaling completion. Printed source saves, AC and ability scores remain fixed.')


def complete_specials(entry, page):
    add = lambda field, name, text: entry.setdefault(field, []).append(rule(name, text))
    legendary = lambda name, text: add('legendary_actions', name, text)
    if page == 'Aetherium Alloy dragon':
        add('traits', 'Heat Resistant', 'Immune to extreme heat conditions. Fire immunity is listed in Damage Immunities.')
        add('traits', 'Magical Stability', 'Immune to spells or effects that would alter its form or enchantments.')
        add('traits', 'Radiation Aura', 'Other creatures within 30 feet of the dragon have disadvantage on saving throws and attack rolls.')
        entry['actions'].append(breath('Aether Breath', 'energy in a 120-foot line, 10 feet wide', 21, 'Dexterity', '20d6 radiant'))
        legendary('Magical Pulse (2 actions)', 'Each other creature within 60 feet makes a DC 19 Constitution save. On a failure, it takes 3d10 radiant damage and is Hobbled for 1 minute. An affected creature repeats the save at the end of each of its turns, ending the effect on a success. On an initial success, it takes no damage and is not Hobbled.' + NO_BLOCK)
        entry['conversion_notes'].append('Printed Aether Breath and Magical Pulse damage/DC/range are preserved. Pulse uses current Hobbled for the old slow-spell rider, costs 2 legendary actions and does nothing on an initial successful save. Radiation Aura excludes its emitter; Heat Resistant does not duplicate fire immunity in the properties list.')
    elif page == 'Aurumathar':
        entry['speed'] = re.sub(r',?\s*teleport\s*\(unlimited\)', '', entry['speed'], flags=re.I)
        add('bonus_actions', 'Arcane Translocation', 'Teleport up to 120 feet to an unoccupied space it can see. This uses its bonus action; it cannot teleport as unrestricted movement.')
        entry['actions'].append(breath('Sovereign Aether Breath', 'arcane energy in a 120-foot line, 20 feet wide', 26, 'Dexterity', '28d6 radiant'))
        legendary('Prismatic Pulse (3 actions)', 'Each other creature within 60 feet makes a DC 26 Constitution save, taking 6d10 force damage and becoming Hobbled for 1 minute on a failure, or taking half damage without becoming Hobbled on a success. An affected creature repeats the save at the end of each of its turns, ending Hobbled on a success.' + NO_BLOCK)
        entry['conversion_notes'].append('Homebrew boss completion: Arcane Translocation replaces the undefined unlimited-teleport speed with a visible 120-foot bonus-action teleport. Sovereign Aether Breath and Prismatic Pulse are self-contained arcane powers, not access to every spell or universal magic immunity. Their numerical values are newly designed for this CR-33 source profile, not recovered source rules.')
    elif page == 'Cerithal Stone dragon':
        add('bonus_actions', 'Difficult Terrain Creation', 'Turn the ground within 60 feet into difficult terrain for 1 minute. Overlapping uses do not stack, and a creature is affected only by the most recent expiry for its space.')
        entry['actions'].append(breath('Rocky Breath', 'rocks in a 60-foot cone', 19, 'Dexterity', '14d6 bludgeoning'))
        legendary('Stone Spike (2 actions)', 'A spike erupts at a point within 60 feet, targeting one creature the dragon can see there. The target makes a DC 19 Dexterity save, taking 4d10 piercing damage and becoming Pinned on a failure, or taking half damage without becoming Pinned on a success. A Pinned creature can use an action to make a DC 19 Strength check to break free. The spike remains as a 5-foot-tall obstacle that can provide cover or hinder movement.' + NO_BLOCK)
        entry['conversion_notes'].append('Printed terrain, breath and Stone Spike numerical effects are retained; Stone Spike uses current Pinned for restrained and costs 2 legendary actions. Overlapping difficult terrain does not stack.')
    elif page == 'Dyspraxium Salt dragon':
        add('traits', 'Phasing Movement', 'Move through creatures and objects as difficult terrain. It cannot willingly end movement inside a solid object. If forced to do so, it takes 5 force damage and moves to the nearest unoccupied space outside it; this damage cannot be Blocked.')
        entry['actions'].append(breath('Phasing Breath', 'ghostly salt in a 60-foot cone', 20, 'Constitution', '14d6 force', 'On a failure, the creature is also Hobbled until the end of its next turn. The breath can affect Ethereal creatures in the area.'))
        legendary('Ghostly Drift (1 action)', 'Move up to 20 feet by flying or swimming without provoking opportunity attacks, obeying Phasing Movement\'s restrictions.')
    elif page == 'Erbion Essence dragon':
        add('traits', 'Restorative Aura', 'A friendly living creature that starts its turn within 10 feet of the dragon while below half its maximum HP regains 1d8 HP, up to half its maximum HP. A creature benefits only once per turn; overlapping restorative auras do not stack.')
        add('actions', 'Healing Breath (Recharge 5-6; 3/day)', 'Exhale restorative essence in a 60-foot cone. Each friendly living creature in the cone regains 6d8 + 6 HP. Each hostile undead creature in the cone makes a DC 18 Constitution save, taking 6d8 radiant damage on a failure, or half on a success. It has three uses per 24 hours and must also recharge between uses: after use, roll 1d6 at the start of each of its turns; on 5 or 6, this breath recharges. The saving-throw damage cannot be Blocked.')
        legendary('Vital Shelter (1 action)', 'One friendly living creature the dragon can see within 30 feet gains 5 temporary HP until the start of the dragon\'s next turn. Temporary HP do not stack.')
    elif page == 'Euralite Gem dragon':
        add('traits', 'Illuminating Presence', 'The dragon emits bright light within 40 feet and dim light for another 40 feet. It can suppress or restore this light at the start of its turn without an action.')
        entry['actions'].append(breath('Radiant Breath', 'radiant light in a 60-foot cone', 18, 'Constitution', '14d6 radiant', 'On a failure, the creature is also Blinded until the end of its next turn.'))
        legendary('Light Burst (2 actions)', 'Each other creature within 15 feet makes a DC 18 Constitution save, taking 3d8 radiant damage and becoming Blinded until the start of the dragon\'s next turn on a failure, or taking half damage without becoming Blinded on a success.' + NO_BLOCK)
    elif page == 'Holmara Rock dragon':
        add('traits', 'Stone Anchorage', 'The dragon has advantage on saving throws against being knocked Prone or moved against its will while standing on earth or stone.')
        entry['actions'].append(breath('Earthquake Breath', 'shattering rock in a 60-foot cone', 21, 'Strength', '16d6 bludgeoning', 'On a failure, the creature also falls Prone. Ground in the cone becomes difficult terrain for 1 minute; overlapping uses do not stack.'))
        legendary('Fault Line (2 actions)', 'Create a fracture in a 60-foot line, 5 feet wide, originating at the dragon. Each creature in the line makes a DC 21 Dexterity save, taking 3d8 bludgeoning damage and falling Prone on a failure, or taking half damage without falling Prone on a success.' + NO_BLOCK)
    elif page == 'Lanthara Crystal dragon':
        entry['actions'].append(breath('Radiant Breath', 'refracted light in a 60-foot cone', 18, 'Dexterity', '12d6 radiant', 'On a failure, the creature is also Blinded until the end of its next turn.'))
        add('reactions', 'Crystal Reflection (3/day)', 'When the dragon takes damage from a spell cast by a creature it can see within 60 feet, halve that damage against the dragon. The caster then takes damage of the same type equal to the amount prevented, rounded down. Reflected automatic damage cannot be Blocked and cannot itself trigger Crystal Reflection. It has three uses per 24 hours.')
        legendary('Prismatic Flash (2 actions)', 'Each other creature within 15 feet makes a DC 18 Constitution save. On a failure, it is Blinded until the end of its next turn. This effect deals no damage.' + NO_BLOCK)
    elif page == 'Neodrakite dragon':
        add('actions', 'Magnetic Field Manipulation', 'Choose one creature holding a metal item or one unattended nonmagical metal object weighing at most 100 pounds within 60 feet. A holder makes a DC 18 Strength save or drops one metal item of the dragon\'s choice. The dragon may then move the dropped or unattended item up to 10 feet to an unoccupied location within range. It cannot move an object through solid obstacles.' + NO_BLOCK)
        entry['actions'].append(breath('Metal Attraction/Repulsion Breath', 'a magnetic pulse in a 60-foot cone', 18, 'Dexterity', '12d6 lightning', 'On a failure, a creature wearing metal is pulled 10 feet toward the dragon; another creature is pushed 10 feet away. This movement cannot pass through solid obstacles, and the creature then falls Prone. On a success, no movement or Prone is applied.'))
        legendary('Magnetic Pull (1 action)', 'Pull one creature the dragon can see within 60 feet that is wearing or holding metal up to 30 feet toward itself. The movement stops before solid obstacles and in the nearest available space; it deals no collision damage. This source-specific movement has no additional save.')
        entry['conversion_notes'].append('Printed magnetic breath damage/DC/cone are retained. Added 10-foot displacement, half damage without movement/Prone on a successful save, a 60-foot sight/range limit for Magnetic Pull, and a one-item/100-pound boundary for manipulation. Magnetic Pull costs 1 legendary action and retains its source no-save movement.')
    elif page == 'Samarkium Ore dragon':
        entry['actions'].append(breath('Poison Breath', 'toxic gas in a 60-foot cone', 18, 'Constitution', '13d6 poison', 'On a failure, the creature is also Poisoned for 1 minute. It repeats the save at the end of each of its turns, ending Poisoned on a success.'))
        add('bonus_actions', 'Noxious Cloud (shares breath recharge)', 'If Poison Breath is charged, expend that charge to create a 20-foot-radius sphere of toxic gas centered on a point it can see within 60 feet. The cloud lasts for 1 minute and is heavily obscured; a new cloud ends its previous one. A creature that starts its turn in the cloud makes a DC 18 Constitution save, taking 2d6 poison damage and becoming Poisoned until the end of that turn on a failure, or taking no damage and not becoming Poisoned on a success. This saving-throw damage cannot be Blocked. The shared breath charge recovers on a 5 or 6 on the start-of-turn d6 roll.')
        legendary('Miasma Pulse (2 actions)', 'Each other creature within 10 feet makes a DC 18 Constitution save, taking 2d6 poison damage and becoming Poisoned until the start of the dragon\'s next turn on a failure, or taking half damage without becoming Poisoned on a success.' + NO_BLOCK)
    elif page == 'Terbithal Resin dragon':
        entry['actions'].append(breath('Blinding Breath', 'luminous resin in a 60-foot cone', 21, 'Constitution', '14d6 radiant', 'On a failure, the creature is also Blinded until the end of its next turn.'))
        add('actions', 'Amber Restraint (shares breath recharge)', 'If Blinding Breath is charged, expend that charge to coat a 20-foot square of ground it can see within 60 feet in sticky resin for 1 minute; a new square ends its previous one. The area is difficult terrain. Each creature on the ground in the square when it appears makes a DC 21 Dexterity save, becoming Pinned on a failure. A Pinned creature can use an action to make a DC 21 Strength check, ending Pinned on a success; the condition also ends when the resin disappears. A creature entering the square later is affected by difficult terrain but is not automatically Pinned. The shared breath charge recovers on a 5 or 6 on the start-of-turn d6 roll. This effect deals no damage and cannot be Blocked.')
        legendary('Resin Veil (2 actions)', 'One creature the dragon can see within 60 feet makes a DC 21 Constitution save, becoming Blinded until the end of its next turn on a failure. This effect deals no damage.' + NO_BLOCK)
    elif page == 'Thulmara Dust dragon':
        add('traits', 'Chilling Aura', 'A hostile creature that starts its turn within 10 feet of the dragon makes a DC 19 Constitution save. On a failure, its movement speed is reduced by 10 feet until the start of its next turn. This speed reduction does not stack with Rime Pulse.')
        entry['actions'].append(breath('Frost Breath', 'icy dust in a 60-foot cone', 19, 'Constitution', '14d6 cold', 'On a failure, the creature is also Hobbled until the end of its next turn.'))
        legendary('Rime Pulse (2 actions)', 'One creature the dragon can see within 30 feet makes a DC 19 Constitution save, taking 4d6 cold damage and having its movement speed reduced by 10 feet until the end of its next turn on a failure, or taking half damage without the speed reduction on a success. This speed reduction does not stack with Chilling Aura.' + NO_BLOCK)
    elif page == 'Ytriun Metal dragon':
        add('traits', 'Heat Aura', 'A creature that starts its turn within 10 feet of the dragon takes 2d6 fire damage. This automatic damage cannot be Blocked.')
        entry['actions'].append(breath('Fire Breath', 'fire in a 60-foot cone', 19, 'Dexterity', '13d6 fire'))
        legendary('Molten Metal Surge (3 actions)', 'Choose one creature or a 10-foot-radius area the dragon can see within 60 feet. A targeted creature makes a DC 19 Dexterity save. On a failure, it takes 4d10 fire damage and is coated in molten metal, taking another 2d10 fire damage at the start of each of its turns. On a success, it takes no damage and is not coated. The coating falls off after 1 minute; the creature or an adjacent ally can use an action to scrape it off or douse it in water to end it early. If an area is targeted instead, it is hazardous for 1 minute; a creature entering it for the first time on a turn or starting its turn there takes 2d10 fire damage, at most once per turn. A new hazardous area ends the dragon\'s previous one. This saving-throw-only and automatic damage cannot be Blocked.')
        entry['conversion_notes'].append('Printed Heat Aura, Fire Breath and Molten Metal Surge damage/DC/range are retained. Surge costs 3 legendary actions, deals no effect to a creature that succeeds on its save, and creates hazardous terrain for 1 minute with once-per-turn damage. An adjacent ally may help remove a coating.')
    else:
        raise ValueError('Missing completed dragon profile: ' + page)


def build(source=SOURCE):
    snapshot = json.loads(Path(source).read_text(encoding='utf-8'))
    entries = []
    printed_specials = {'Aetherium Alloy dragon', 'Cerithal Stone dragon', 'Neodrakite dragon', 'Ytriun Metal dragon'}
    for raw in snapshot['entries']:
        fields = raw['fields']
        size, creature_type, alignment = [part.strip() for part in fields['type'].split(',', 2)]
        dexterity = (int(raw['abilities']['dex']) - 10) // 2
        entry = {
            'name': raw['title'], 'group': 'Tarta wiki - Mythos dragons',
            'id': 'tarta-' + re.sub(r'[^a-z0-9]+', '-', raw['title'].lower()).strip('-'),
            'meta': f'{size} {creature_type.lower()}, {alignment.lower()}',
            'size': size, 'type': creature_type.lower(), 'alignment': alignment.lower(),
            'cr': raw['cr'], 'ac': fields['armor_class'], 'hp': re.match(r'\d+', fields['hit_points'])[0],
            'block': f'{max(0, dexterity)} pool / {dexterity:+d} check',
            'speed': fields['speed'], 'abilities': deepcopy(raw['abilities']),
            'status': 'Converted homebrew', 'description': raw['combat_lore'],
            'source_ref': raw['url'], 'original_5e': deepcopy(raw),
            'conversion_notes': [
                'Imported from the rendered Tarta wiki pages on ' + snapshot['retrieved'] + '. Source attribution: ' + snapshot['license'] + '.',
                'Source AC, printed fixed HP, saves, six abilities and CR are retained. Inconsistent source HP dice formulas remain in Original source statblock rather than being displayed as an alternative HP total.',
                'Current Dexterity-derived Block pool/check applies. Natural armor does not grant equipment proficiency or extra Block. Ordinary attack damage and riders require an unblocked strike; saving-throw-only and automatic damage cannot be Blocked.',
                'These are completed homebrew combat profiles, not claims that the omitted original wiki rules were recovered. Source CR is an encounter reference and needs playtesting after conversion. No unprinted age variants are generated.',
            ],
            'replacement_sources': [
                {'name': 'Converted dragon action framework', 'source': 'data/monsters/template.yaml / Adult Red Dragon; data/monsters/steel-dragons.yaml'},
                {'name': 'Material themes', 'source': 'draft2.pdf / PDF pages 28 and 62; docs/tarta-homebrewery-summon-audit.md'},
            ],
        }
        xp = re.search(r'\(([0-9,]+) XP\)', fields.get('challenge_rating', raw.get('source_general_challenge', '')))
        if xp:
            entry['xp'] = xp[1]
        for key in ['saving_throws', 'skills', 'damage_immunities', 'damage_resistances', 'condition_immunities', 'senses', 'languages']:
            if fields.get(key):
                entry[key] = fields[key].replace('Atacks', 'Attacks').replace('True Sight', 'truesight')
        common_combat(entry)
        complete_specials(entry, raw['page'])
        if raw['page'] not in printed_specials and raw['page'] != 'Aurumathar':
            entry['conversion_notes'].append('Homebrew material completion: the wiki provides the theme but no numerical special powers. Breath, aura, reaction and legendary-option values here are newly designed adaptations of that theme, informed by the PDF\'s weapon/Bastion/golem examples. Those examples\' bonuses are not automatically applied on top of this dragon\'s fixed AC or attacks. Any stated daily limit is per 24 hours.')
        entries.append(entry)
    names = [entry['name'].casefold() for entry in entries]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate Tarta creature')
    return {'section': 'monsters', 'entries': entries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check generated YAML without writing')
    args = parser.parse_args()
    document = build()
    text = '# Generated by scripts/import_tarta_monsters.py from the checked-in wiki snapshot.\n' + yaml.safe_dump(document, sort_keys=False, allow_unicode=True, width=110)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != text:
            raise SystemExit('Tarta monster data differs; regenerate it.')
    else:
        OUTPUT.write_text(text, encoding='utf-8')
    print('Checked' if args.check else 'Imported', len(document['entries']), 'Tarta wiki statblocks')


if __name__ == '__main__':
    main()
