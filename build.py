"""Build a modular website and explicit portable copies from the same YAML."""

import argparse
import hashlib
from html import escape
import json
import os
from pathlib import Path
import re
import tempfile

from compiler import compile_data
from character_rules import compile_character_rules


ROOT = Path(__file__).resolve().parent


def inline_asset(template, pattern, replacement, asset, page):
    """Fail early if the template and build no longer agree about an asset."""
    if len(re.findall(pattern, template, flags=re.IGNORECASE)) != 1:
        raise ValueError(f"Expected exactly one reference to {asset} in web/{page}")
    return re.sub(pattern, lambda _: replacement, template, count=1, flags=re.IGNORECASE)


def render_page(page, stylesheet, scripts, catalog_script):
    web = ROOT / "web"
    template = (web / page).read_text(encoding="utf-8")
    styles = (web / stylesheet).read_text(encoding="utf-8")
    template = inline_asset(
        template, rf'<link\b[^>]*\bhref=["\'](?:\./)?{re.escape(stylesheet)}["\'][^>]*>',
        f"<style>\n{styles}\n</style>", stylesheet, page,
    )
    # Move inline scripts to the end of the body. Browsers ignore defer on inline scripts.
    inline = [catalog_script]
    for name in ("catalog-loader.js", *scripts):
        pattern = rf'<script\b[^>]*\bsrc=["\'](?:\./)?{re.escape(name)}["\'][^>]*>\s*</script>'
        template = inline_asset(template, pattern, "", name, page)
        source = (web / name).read_text(encoding="utf-8")
        inline.append(f"<script>\n{source}\n</script>")
    if template.count("</body>") != 1:
        raise ValueError(f"Expected one closing body tag in web/{page}")
    return template.replace("</body>", "\n".join(inline) + "\n</body>")


def write_page(path, html):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = tempfile.NamedTemporaryFile(dir=path.parent, delete=False, suffix=".tmp")
    try:
        with temp:
            temp.write(html.encode("utf-8"))
        os.replace(temp.name, path)
    finally:
        Path(temp.name).unlink(missing_ok=True)


def json_text(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def hashed_file(output_dir, folder, stem, suffix, content):
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:12]
    relative = f"{folder}/{stem}.{digest}.{suffix}"
    write_page(output_dir / relative, content)
    return relative


def patch_notes_html():
    """Render the project's headings, paragraphs and flat release-note lists."""
    result, in_list = [], False
    for line in (ROOT / "PATCH_NOTES.md").read_text(encoding="utf-8").splitlines():
        if not line.startswith("- ") and in_list:
            result.append("</ul>")
            in_list = False
        heading = re.match(r"^(#{1,3}) (.*)$", line)
        if heading:
            level = len(heading.group(1))
            result.append(f"<h{level}>{escape(heading.group(2))}</h{level}>")
        elif line.startswith("- "):
            if not in_list:
                result.append("<ul>")
                in_list = True
            result.append(f"<li>{escape(line[2:])}</li>")
        elif line.strip():
            result.append(f"<p>{escape(line)}</p>")
    if in_list:
        result.append("</ul>")
    return "\n".join(result)


def build(output_dir):
    sections = compile_data(ROOT / "data")
    metadata = compile_character_rules(sections)
    # Reuse explicit author levels, without guessing from spell costs or prose.
    archetype_levels = {(item["className"].casefold(), item["name"].casefold()): item["minLevel"]
                       for item in metadata["archetypes"] if item["minLevelSource"] == "explicit"}
    for section in sections:
        if section["key"] == "classes":
            for entry in section["entries"]:
                parent = re.sub(r" archetypes?$", "", entry["group"], flags=re.IGNORECASE)
                required = archetype_levels.get((parent.casefold(), entry["name"].casefold()))
                if required is not None:
                    entry["requiredLevel"] = required
    # Escape '<' so text in a rule can never close its containing script.
    payload = json.dumps(sections, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    payload = payload.replace("<", r"\u003c").replace("\u2028", r"\u2028").replace("\u2029", r"\u2029")
    mechanics = json.dumps(metadata, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    mechanics = mechanics.replace("<", r"\u003c").replace("\u2028", r"\u2028").replace("\u2029", r"\u2029")
    effects = "".join((ROOT / "web" / name).read_text(encoding="utf-8") for name in
                      ("character-effects.js", "character-equipment.js", "character-casting.js", "character-rules.js"))
    rules_version = "catalog-" + hashlib.sha256((payload + mechanics + effects).encode("utf-8")).hexdigest()[:12]
    catalog_script = (
        f"<script>globalThis.DND_CATALOG={payload};\n"
        f"globalThis.DND_RULES_VERSION='{rules_version}';\n"
        f"globalThis.DND_CHARACTER_RULES={mechanics};</script>"
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    # Loaded only on file: URLs, keeping old localStorage locations usable.
    write_page(output_dir / "data/portable-catalog.js", catalog_script.removeprefix("<script>").removesuffix("</script>"))
    manifest = {"version": rules_version, "sections": [], "builder": hashed_file(
        output_dir, "data", "character-rules", "json", mechanics)}
    for section in sections:
        manifest["sections"].append({"key": section["key"], "title": section["title"],
            "count": len(section["entries"]), "url": hashed_file(
                output_dir, "data", section["key"], "json", json_text(section))})
    write_page(output_dir / "data/catalog-manifest.json", json_text(manifest))
    pages = (("index.html", "styles.css", ("entry-order.js", "magic-categories.js", "item-views.js", "browse-views.js", "magic-items.js", "rule-presentation.js", "monster-editor.js", "monster-views.js", "geomancy-review.js", "app.js")),
             ("character.html", "character.css", ("entry-order.js", "magic-categories.js", "item-views.js", "magic-items.js", "character-state.js", "character-effects.js",
              "character-equipment.js", "character-casting.js", "character-rules.js", "character-builder.js", "character.js")))
    assets = {}
    for page, stylesheet, scripts in pages:
        normal = (ROOT / "web" / page).read_text(encoding="utf-8")
        for name in (stylesheet, "catalog-loader.js", *scripts):
            if name not in assets:
                source = (ROOT / "web" / name).read_text(encoding="utf-8")
                asset = Path(name)
                assets[name] = hashed_file(output_dir, "assets", asset.stem, asset.suffix[1:], source)
            normal = normal.replace(f'"{name}"', f'"{assets[name]}"')
        write_page(output_dir / page, normal)
        write_page(output_dir / "offline" / page, render_page(page, stylesheet, scripts, catalog_script))
    notes = (ROOT / "web/patch-notes.html").read_text(encoding="utf-8").replace("<!-- PATCH_NOTES_CONTENT -->", patch_notes_html())
    write_page(output_dir / "patch-notes.html", notes.replace('"styles.css"', f'"{assets["styles.css"]}"'))
    write_page(output_dir / "offline/patch-notes.html", notes.replace('<link rel="stylesheet" href="styles.css">',
               "<style>" + (ROOT / "web/styles.css").read_text(encoding="utf-8") + "</style>"))
    (output_dir / ".nojekyll").touch()
    print(f"Built {output_dir.name}/ with section data and offline/ portable copies")
    for section in sections:
        print(f"  {section['title']}: {len(section['entries'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "site")
    build(parser.parse_args().output_dir)
