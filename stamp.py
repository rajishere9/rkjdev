# Adds ?v=<content hash> to local asset URLs in every hand-written page so browsers never mix old and new files.
# Relative paths resolve against the page; root-absolute paths (/site.css, /favicon.svg) against the repo root.
# /blog/ is skipped: the newsroom rewrites that block itself. Blog pages get their hashes from newsroom/src/render.mjs.
import hashlib, re, pathlib
root = pathlib.Path(__file__).parent
pattern = re.compile(r'(src|href)="((?!https?:|mailto:|#|data:|//|/blog/)[^"?#]+\.(?:css|js|jpg|jpeg|png|webp|svg))(?:\?v=[0-9a-f]+)?"')
pages = [root / "index.html", root / "404.html", root / "privacy/index.html", *sorted((root / "candledeep").glob("*.html")),
         root / "play/index.html", root / "play/ai-dle/index.html", root / "play/scale-of-ai/index.html", root / "play/night-shift/index.html"]
for page in pages:
    if not page.is_file():
        continue
    html = page.read_text()
    def stamp(m):
        url = m.group(2)
        f = (root / url.lstrip("/")).resolve() if url.startswith("/") else (page.parent / url).resolve()
        if not f.is_file():
            return m.group(0)
        return f'{m.group(1)}="{url}?v={hashlib.md5(f.read_bytes()).hexdigest()[:8]}"'
    page.write_text(pattern.sub(stamp, html))
    print(page.relative_to(root), len(re.findall(r'\?v=', page.read_text())), "stamped")
