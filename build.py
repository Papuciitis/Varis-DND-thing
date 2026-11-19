"""Build one portable Open D&D reference page from the repository's YAML."""

import argparse
import json
import os
from pathlib import Path
import re
import tempfile

from compiler import compile_data


ROOT = Path(__file__).resolve().parent


def inline_asset(template, pattern, replacement, asset):
    """Fail early if the template and build no longer agree about an asset."""
    if len(re.findall(pattern, template, flags=re.IGNORECASE)) != 1:
        raise ValueError(f"Expected exactly one reference to {asset} in web/index.html")
    return re.sub(pattern, lambda _: replacement, template, count=1, flags=re.IGNORECASE)


def build(output_dir):
    sections = compile_data(ROOT / "data")
    web = ROOT / "web"
    template = (web / "index.html").read_text(encoding="utf-8")
    styles = (web / "styles.css").read_text(encoding="utf-8")
    app = (web / "app.js").read_text(encoding="utf-8")
    # Escape '<' so text in a rule can never close its containing script.
    payload = json.dumps(sections, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    payload = payload.replace("<", r"\u003c").replace("\u2028",r"\u2028").replace("\u2029",r"\u2029")
    template = inline_asset(
        template, r'<link\b[^>]*\bhref=["\'](?:\./)?styles\.css["\'][^>]*>',
        f"<style>\n{styles}\n</style>", "styles.css",
    )
    # Move inline scripts to the end of the body. Browsers ignore defer on inline scripts.
    for name in ("catalog.js", "app.js"):
        template = inline_asset(
            template, rf'<script\b[^>]*\bsrc=["\'](?:\./)?{re.escape(name)}["\'][^>]*>\s*</script>',
            "", name,
        )
    scripts = f"<script>globalThis.DND_CATALOG={payload};</script>\n<script>\n{app}\n</script>"
    if template.count("</body>") != 1:
        raise ValueError("Expected one closing body tag")
    output = template.replace("</body>", scripts + "\n</body>")
    output_dir.mkdir(parents=True, exist_ok=True)
    temp = tempfile.NamedTemporaryFile(dir=output_dir, delete=False, suffix=".tmp")
    try:
        with temp:
            temp.write(output.encode("utf-8"))
        os.replace(temp.name, output_dir / "index.html")
    finally:
        Path(temp.name).unlink(missing_ok=True)
    (output_dir / ".nojekyll").touch()
    print(f"Built {output_dir.name}/index.html")
    for section in sections:
        print(f"  {section['title']}: {len(section['entries'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "site")
    build(parser.parse_args().output_dir)
