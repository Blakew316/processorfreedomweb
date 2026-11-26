#!/usr/bin/env python3
"""Fetch one source (web page, PDF, or a local PDF) and save it as plain text for the Scout research.

usage: python3 -I tools/fetch.py <family> <name> <url-or-local-path> [--browser]
Writes raw/<family>/<name>.txt (+ .bin) and appends one row to raw/<family>/index.tsv.
--browser renders the page in a real browser first (for pages that need JavaScript or block plain downloads).
"""
import hashlib, html.parser, os, re, shutil, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


class Text(html.parser.HTMLParser):
    """Collects the visible text of an HTML page, skipping scripts, styles and navigation chrome."""
    SKIP = {"script", "style", "noscript", "svg", "head", "template"}
    BLOCK = {"p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "td", "th", "dt", "dd"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self.skip += 1
        if tag in self.BLOCK: self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip: self.skip -= 1
        if tag in self.BLOCK: self.out.append("\n")

    def handle_data(self, data):
        if not self.skip: self.out.append(data)


def tidy(text):
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip() + "\n"


def main():
    args = [a for a in sys.argv[1:] if a != "--browser"]
    browser = "--browser" in sys.argv
    if len(args) != 3 or not re.fullmatch(r"[a-z0-9-]+", args[0]) or not re.fullmatch(r"[A-Za-z0-9._-]+", args[1]):
        sys.exit(__doc__)
    family, name, src = args
    folder = os.path.join(ROOT, "raw", family)
    os.makedirs(folder, exist_ok=True)
    binp, txtp = os.path.join(folder, name + ".bin"), os.path.join(folder, name + ".txt")
    code = "local"
    if re.match(r"https?://", src):
        if browser:
            r = subprocess.run(["node", os.path.join(ROOT, "tools", "render.cjs"), src], capture_output=True, text=True, timeout=120)
            code = "browser" if r.returncode == 0 else "browser-failed"
            open(binp, "w", encoding="utf-8").write(r.stdout)
        else:
            r = subprocess.run(["curl", "-s", "-L", "-m", "90", "-A", UA, "-o", binp, "-w", "%{http_code}", src], capture_output=True, text=True)
            code = r.stdout.strip() or "000"
        recorded = src
    else:
        if not os.path.isfile(src): sys.exit(f"no such file: {src}")
        shutil.copyfile(src, binp)
        recorded = "repo:" + src.split("/repequipment/", 1)[-1]
    data = open(binp, "rb").read() if os.path.exists(binp) else b""
    kind = "pdf" if data[:5] == b"%PDF-" else ("text" if browser else "html")
    if kind == "pdf":
        subprocess.run(["pdftotext", "-layout", binp, txtp], check=False)
        text = open(txtp, encoding="utf-8", errors="replace").read() if os.path.exists(txtp) else ""
    elif kind == "text":
        text = tidy(data.decode("utf-8", "replace"))
    else:
        p = Text(); p.feed(data.decode("utf-8", "replace")); text = tidy("".join(p.out))
    open(txtp, "w", encoding="utf-8").write(text)
    words = len(text.split())
    with open(os.path.join(folder, "index.tsv"), "a", encoding="utf-8") as f:
        f.write("\t".join([name, recorded, code, str(len(data)), hashlib.sha256(data).hexdigest()[:16], kind, str(words), time.strftime("%Y-%m-%d")]) + "\n")
    hint = "" if words > 80 else "  <-- almost empty: try --browser, or the site blocks downloads"
    print(f"{code} {kind} {words} words -> raw/{family}/{name}.txt{hint}")


main()
