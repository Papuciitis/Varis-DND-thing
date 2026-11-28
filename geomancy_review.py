"""Attach pending author annotations and drafts; approved spells live in normal data."""

from copy import deepcopy


SNAPSHOT_DIRECTORY = "geomancy-review-but-like-reviewed-this-time/"
DECISIONS_PATH = "geomancy-review/decisions.yaml"
STATUSES = {"draft", "merge", "rejected", "needs-design"}
MAGIC_CLASSES = {"Arcane", "Oath", "Occult", "Mystic"}


def apply_geomancy_review(snapshots, decisions, sections):
    """Keep one source identity, with independently editable review metadata."""
    entries = sections["geomancy-review"]["entries"]
    originals = {(entry["group"], entry["name"]): entry for entry in entries}
    names = {entry["name"]: entry for entry in entries}
    if (snapshots or decisions is not None) and len(names) != len(entries):
        raise ValueError("Geomancy review names must be unambiguous across groups")
    annotated = set()
    for path, document in snapshots:
        try:
            if not isinstance(document, dict) or set(document) != {"section", "entries"}:
                raise ValueError("review snapshots require section and entries")
            if document["section"] != "geomancy-review" or not isinstance(document["entries"], list):
                raise ValueError("review snapshots must contain geomancy-review entries")
            for record in document["entries"]:
                if not isinstance(record, dict):
                    raise ValueError("review snapshot entry must be a mapping")
                identity = (record.get("group", ""), record.get("name"))
                if identity not in originals:
                    raise ValueError(f"unknown original review entry {identity!r}")
                if identity in annotated:
                    raise ValueError(f"duplicate review snapshot for {identity!r}")
                annotated.add(identity)
                entry = originals[identity]
                source = {"name": entry["name"], "group": entry["group"], **entry["details"]}
                body = {key: value for key, value in record.items() if key not in {"review", "revidew"}}
                if body != source:
                    raise ValueError(f"review snapshot changes original rules for {entry['name']!r}")
                review_keys = set(record) & {"review", "revidew"}
                if len(review_keys) > 1:
                    raise ValueError(f"multiple review fields for {entry['name']!r}")
                if review_keys:
                    key = next(iter(review_keys))
                    review = record[key]
                    if not isinstance(review, str) or not review.strip():
                        raise ValueError("review text must be nonempty")
                    entry["details"]["review"] = review
                    entry["details"]["review_source"] = path
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError(f"{path}: {exc}") from exc

    for entry in entries:
        details = entry["details"]
        details["review_status"] = ("source-missing" if "description missing" in details.get("draft_note", "")
                                    else "needs-design" if "review" in details else "unreviewed")
    if decisions is None:
        return
    try:
        if not isinstance(decisions, dict) or set(decisions) != {"geomancy_decisions"}:
            raise ValueError("expected only geomancy_decisions")
        records = decisions["geomancy_decisions"]
        if not isinstance(records, list):
            raise ValueError("geomancy_decisions must be a list")
        seen, proposal_names = set(), set()
        spells = {(entry["group"], entry["name"]) for entry in sections["spells"]["entries"]}
        for record in records:
            if not isinstance(record, dict) or record.keys() - {
                "name", "status", "decision", "conversion", "related_spells", "questions", "author_response", "final-answer"
            }:
                raise ValueError("invalid decision fields")
            name, status = record.get("name"), record.get("status")
            if name not in names:
                raise ValueError(f"unknown decision target {name!r}")
            if name in seen:
                raise ValueError(f"duplicate decision for {name!r}")
            seen.add(name)
            details = names[name]["details"]
            if "review" not in details:
                raise ValueError(f"decision for {name!r} has no author review")
            if status not in STATUSES:
                raise ValueError(f"invalid review status {status!r}")
            if not isinstance(record.get("decision"), str) or not record["decision"].strip():
                raise ValueError(f"missing decision explanation for {name!r}")
            conversion = record.get("conversion")
            if (status == "draft") != (conversion is not None):
                raise ValueError(f"only drafted entries require a conversion: {name!r}")
            if conversion is not None:
                validate_conversion(conversion, name)
                identity = conversion["name"].casefold()
                if identity in proposal_names:
                    raise ValueError(f"duplicate proposed spell {conversion['name']!r}")
                proposal_names.add(identity)
            related = record.get("related_spells", [])
            if not isinstance(related, list):
                raise ValueError("related_spells must be a list")
            for spell in related:
                if (not isinstance(spell, dict) or spell.keys() - {"name", "group", "notes"}
                        or (spell.get("group"), spell.get("name")) not in spells):
                    raise ValueError(f"unknown related current spell for {name!r}: {spell!r}")
                if "notes" in spell and (not isinstance(spell["notes"], str) or not spell["notes"].strip()):
                    raise ValueError(f"related spell notes must be nonempty text for {name!r}")
            questions = record.get("questions", [])
            if not isinstance(questions, list) or any(not isinstance(item, str) or not item.strip() for item in questions):
                raise ValueError("questions must be a list of nonempty text")
            response = latest_author_response(record, conversion)
            details.update(review_status=status, review_decision=record["decision"])
            for key in ("related_spells", "questions"):
                if key in record:
                    details["review_" + key] = deepcopy(record[key])
            if conversion is not None:
                details["review_conversion"] = deepcopy({key: value for key, value in conversion.items()
                                                         if key != "final-answer"})
            if response is not None:
                details["review_author_response"] = response
    except (KeyError, ValueError, TypeError) as exc:
        raise ValueError(f"{DECISIONS_PATH}: {exc}") from exc


def latest_author_response(record, conversion):
    responses = []
    for mapping, key in ((record, "author_response"), (record, "final-answer"),
                         (conversion or {}, "final-answer")):
        if key in mapping:
            value = mapping[key]
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{key} must be nonempty text")
            responses.append(value)
    if len(set(responses)) > 1:
        raise ValueError("conflicting author responses; keep one latest final-answer")
    return responses[0] if responses else None


def validate_conversion(conversion, source_name):
    required = {"name", "magic_class", "level", "casting", "components", "range", "duration", "effect"}
    optional = {"higher_levels", "upgrades", "design_notes", "final-answer"}
    if not isinstance(conversion, dict) or required - conversion.keys() or conversion.keys() - required - optional:
        raise ValueError(f"incomplete or unknown proposed spell fields for {source_name!r}")
    for key, value in conversion.items():
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"proposed {key} must be nonempty text for {source_name!r}")
    if conversion["magic_class"] not in MAGIC_CLASSES:
        raise ValueError(f"unknown proposed magic class for {source_name!r}")
    if conversion["level"] not in {str(level) for level in range(7)}:
        raise ValueError(f"proposed spell level must be 0-6 for {source_name!r}")
