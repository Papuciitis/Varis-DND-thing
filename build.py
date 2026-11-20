"""Build the standalone Open D&D compendium and character sheet from the same YAML."""

import argparse
import hashlib
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
    for name in ("catalog.js", *scripts):
        pattern = rf'<script\b[^>]*\bsrc=["\'](?:\./)?{re.escape(name)}["\'][^>]*>\s*</script>'
        template = inline_asset(template, pattern, "", name, page)
        if name != "catalog.js":
            source = (web / name).read_text(encoding="utf-8")
            inline.append(f"<script>\n{source}\n</script>")
    if template.count("</body>") != 1:
        raise ValueError(f"Expected one closing body tag in web/{page}")
    return template.replace("</body>", "\n".join(inline) + "\n</body>")


def write_page(path, html):
    temp = tempfile.NamedTemporaryFile(dir=path.parent, delete=False, suffix=".tmp")
    try:
        with temp:
            temp.write(html.encode("utf-8"))
        os.replace(temp.name, path)
    finally:
        Path(temp.name).unlink(missing_ok=True)


def build(output_dir):
    sections = compile_data(ROOT / "data")
    # Escape '<' so text in a rule can never close its containing script.
    payload = json.dumps(sections, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    payload = payload.replace("<", r"\u003c").replace("\u2028", r"\u2028").replace("\u2029", r"\u2029")
    mechanics = json.dumps(compile_character_rules(sections), ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    mechanics = mechanics.replace("<", r"\u003c").replace("\u2028", r"\u2028").replace("\u2029", r"\u2029")
    effects = (ROOT / "web" / "character-effects.js").read_text(encoding="utf-8")
    rules_version = "catalog-" + hashlib.sha256((payload + mechanics + effects).encode("utf-8")).hexdigest()[:12]
    catalog_script = (
        f"<script>globalThis.DND_CATALOG={payload};\n"
        f"globalThis.DND_RULES_VERSION='{rules_version}';\n"
        f"globalThis.DND_CHARACTER_RULES={mechanics};</script>"
    )
    index = render_page("index.html", "styles.css", ("app.js",), catalog_script)
    sheet = render_page("character.html", "character.css", ("character-state.js", "character-effects.js", "character-equipment.js", "character-rules.js", "character-builder.js", "character.js"), catalog_script)
    output_dir.mkdir(parents=True, exist_ok=True)
    write_page(output_dir / "index.html", index)
    write_page(output_dir / "character.html", sheet)
    (output_dir / ".nojekyll").touch()
    print(f"Built {output_dir.name}/index.html and {output_dir.name}/character.html")
    for section in sections:
        print(f"  {section['title']}: {len(section['entries'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "site")
    build(parser.parse_args().output_dir)
