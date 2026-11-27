"""Attach editorial encounter themes without changing monster identities or rules."""


def apply_monster_themes(document, sections):
    if not isinstance(document, dict) or set(document) != {'monster_themes'}:
        raise ValueError('expected only monster_themes')
    themes = document['monster_themes']
    if not isinstance(themes, list) or not themes:
        raise ValueError('monster_themes must be a nonempty list')
    monsters = {}
    for entry in sections['monsters']['entries']:
        aliases = {entry['name']}
        if entry.get('monster_target'):
            aliases.add(entry['monster_target']['name'])
        for alias in aliases:
            if alias in monsters:
                raise ValueError(f'ambiguous monster name {alias!r}')
            monsters[alias] = entry
    titles, assigned = set(), set()
    for theme in themes:
        if not isinstance(theme, dict) or set(theme) != {'name', 'monsters'}:
            raise ValueError('a theme needs only name and monsters')
        title = theme['name']
        if not isinstance(title, str) or not title.strip():
            raise ValueError('theme name must be nonempty text')
        title = title.strip()
        if title.casefold() in titles:
            raise ValueError(f'duplicate theme {title!r}')
        titles.add(title.casefold())
        references = theme['monsters']
        if not isinstance(references, list) or not references:
            raise ValueError(f'{title}: monsters must be a nonempty list')
        for name in references:
            if not isinstance(name, str) or name not in monsters:
                raise ValueError(f'{title}: unknown monster {name!r}')
            entry = monsters[name]
            identity = (entry['source'], entry['group'], entry['name'])
            if identity in assigned:
                raise ValueError(f'duplicate theme assignment for {name!r}')
            assigned.add(identity)
            # A targeted editor override may choose a different encounter theme.
            explicit = entry['details'].get('encounter_theme')
            if explicit is not None and (not isinstance(explicit, str) or not explicit.strip()):
                raise ValueError(f'{name}: encounter_theme must be nonempty text')
            entry['details']['encounter_theme'] = explicit.strip() if explicit else title
