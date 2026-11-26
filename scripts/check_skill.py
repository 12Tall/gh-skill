"""Check the gh-skill frontmatter and file links without dependencies."""

import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def prose_lines(markdown):
    """Yield lines outside top-level Markdown code fences."""
    fence = None
    for line in markdown.splitlines():
        marker = re.fullmatch(r" {0,3}(`{3,}|~{3,})(.*)", line)
        if fence is not None:
            if marker:
                run, suffix = marker.groups()
                if run[0] == fence[0] and len(run) >= len(fence) and not suffix.strip():
                    fence = None
            continue
        if marker:
            run, suffix = marker.groups()
            if run[0] == "~" or "`" not in suffix:
                fence = run
                continue
        yield line


def main():
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    frontmatter = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    if not frontmatter:
        raise SystemExit("SKILL.md: missing frontmatter")

    fields = dict(re.findall(r"^(name|description):[ \t]*(.*)$", frontmatter[1], re.M))
    if fields.get("name") != "gh-skill":
        raise SystemExit("SKILL.md: name must be gh-skill")
    if not 0 < len(fields.get("description", "").strip()) <= 1024:
        raise SystemExit("SKILL.md: description must be 1–1024 characters")

    missing = []
    for doc in (ROOT / "SKILL.md", ROOT / "README.md", *(ROOT / "references").rglob("*.md")):
        prose = "\n".join(prose_lines(doc.read_text(encoding="utf-8")))
        for target in re.findall(r"\]\(([^\s)]+)\)", prose):
            link = urlsplit(target)
            if link.scheme or link.netloc or not link.path:
                continue
            if not (doc.parent / unquote(link.path)).exists():
                missing.append(f"{doc.relative_to(ROOT)}: {target}")
    if missing:
        raise SystemExit("Missing relative link targets:\n" + "\n".join(missing))
    print("Skill frontmatter and relative links OK")


if __name__ == "__main__":
    main()
