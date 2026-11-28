"""Keep historical collection checks independent of later additions."""

APPROVED_GEOMANCY_SPELL_SOURCE = 'spells/geomancy-approved.yaml'


def original_spell_entries(entries):
    """Monster-import checks still guard the original spell collection."""
    return [entry for entry in entries if entry['source'] != APPROVED_GEOMANCY_SPELL_SOURCE]

ORIGINAL_MONSTER_SOURCES = frozenset({
    'monsters.yaml',
    'monsters/template.yaml',
    'monsters/steel-dragons.yaml',
    'monsters/chronica.yaml',
    'monsters/smash-and-grab.yaml',
    'monsters/tarta-wiki.yaml',
    'monsters/tarta-elementals-low.yaml',
    'monsters/tarta-elementals-high.yaml',
    'monsters/tarta-summons.yaml',
})
