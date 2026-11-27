"""Keep creature references in sync with reviewed public titles."""
import re

def apply_monster_reference_names(sections):
    monsters = sections['monsters']['entries']
    aliases = {}
    for entry in monsters:
        names = [entry.get('monster_target', {}).get('name')]
        naming = entry['details'].get('source_naming', {})
        names += [naming.get('original_name'), *naming.get('previous_names', [])]
        for name in names:
            if name and name != entry['name']:
                aliases[name] = entry['name']
    if not aliases:
        return
    folded = {key.casefold(): value for key, value in aliases.items()}
    spell_names = {entry['name'].casefold() for entry in sections['spells']['entries']}
    pattern = re.compile(r'(?<![\w])(?:' + '|'.join(re.escape(k) for k in sorted(aliases, key=len, reverse=True)) + r')(?![\w])', re.I)

    def text(value, *, protect_spells=True):
        def replacement(match):
            if protect_spells and match[0].casefold() in spell_names:
                return match[0]
            result = folded[match[0].casefold()]
            return result.lower() if match[0].islower() else result
        return pattern.sub(replacement, value)

    def references(value):
        if isinstance(value, list):
            return [references(item) for item in value]
        if isinstance(value, dict):
            return {key: (aliases.get(item, item) if key == 'monster' and isinstance(item, str)
                          else text(item, protect_spells=False) if key == 'label' and isinstance(item, str)
                          else references(item)) for key, item in value.items()}
        return value

    for section in sections.values():
        for entry in section['entries']:
            details = entry['details']
            if isinstance(details, dict) and details.get('summons'):
                original = details['summons']
                current = references(original)
                if current != original and section.get('key') == 'geomancy-review':
                    details.setdefault('source_summons', original)
                details['summons'] = current
    # Story and action wording can mention another creature without a structured link.
    for entry in monsters:
        details = entry['details']
        for field in ('traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions',
                      'mythic_actions', 'lair_actions', 'regional_effects'):
            for row in details.get(field, []):
                row['name'] = text(row['name'])
                row['description'] = text(row['description'])
        for field in ('description', 'desc'):
            if isinstance(details.get(field), str):
                details[field] = text(details[field])
