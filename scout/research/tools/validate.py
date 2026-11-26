#!/usr/bin/env python3
"""Check one Scout library file: its shape, and that every entry's quote really is in the saved source text.

usage: python3 -I tools/validate.py library/<family>.json
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS = {"install", "daily-use", "power", "connect", "printer", "card-read", "decline", "error-code", "batch", "refund-void", "tips", "update", "frozen", "tamper", "password", "pairing", "other"}
KINDS = {"fix", "how-to", "error-code", "install", "reference"}
ESC = {None, "tech", "client-services", "pos", "brand"}


def squash(text):
    """Letters and digits only, lower case: line breaks, hyphenation and fancy quotes in a PDF do not break a match."""
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKC", text).lower())


def main():
    path = sys.argv[1]
    lib = json.load(open(path, encoding="utf-8"))
    ids = {d["id"] for d in json.load(open(os.path.join(ROOT, "inventory.json"), encoding="utf-8"))}
    bad, texts, seen = [], {}, set()
    family = lib.get("family", "")
    for d in lib.get("devices", []):
        if d not in ids: bad.append(f"devices: unknown device id {d!r}")
    sources = {s.get("id"): s for s in lib.get("sources", [])}
    for sid, s in sources.items():
        for key in ("url", "title", "publisher", "tier", "local"):
            if s.get(key) in (None, ""): bad.append(f"source {sid}: missing {key}")
        if s.get("tier") not in (1, 2): bad.append(f"source {sid}: tier must be 1 (the maker) or 2 (a processor or reseller)")
        local = os.path.join(ROOT, str(s.get("local", "")))
        if not os.path.isfile(local) or not os.path.realpath(local).startswith(os.path.join(ROOT, "raw") + os.sep): bad.append(f"source {sid}: no saved text at {s.get('local')!r} (must be under raw/)")
        else: texts[sid] = squash(open(local, encoding="utf-8", errors="replace").read())
    ok = 0
    for e in lib.get("entries", []):
        eid, problems = e.get("id", "?"), []
        if eid in seen: problems.append("duplicate id")
        seen.add(eid)
        if e.get("topic") not in TOPICS: problems.append(f"topic {e.get('topic')!r} not allowed")
        if e.get("kind") not in KINDS: problems.append(f"kind {e.get('kind')!r} not allowed")
        if e.get("escalate_to") not in ESC: problems.append(f"escalate_to {e.get('escalate_to')!r} not allowed")
        if not isinstance(e.get("merchant_can_do"), bool): problems.append("merchant_can_do must be true or false")
        if not e.get("title"): problems.append("no title")
        if not e.get("steps") or not all(isinstance(s, str) and s.strip() for s in e["steps"]): problems.append("steps must be a non-empty list of sentences")
        devs = e.get("devices") or []
        if not devs or any(d != "*" and d not in ids for d in devs): problems.append(f"devices {devs!r}: use ids from inventory.json, or ['*'] for the whole family")
        q = squash(e.get("quote", ""))
        if len(q) < 20: problems.append("quote too short (needs at least 20 letters or digits, copied exactly from the source)")
        elif e.get("source") not in texts: problems.append(f"source {e.get('source')!r} has no saved text")
        elif q not in texts[e["source"]]: problems.append("quote is NOT in the saved source text")
        if problems: bad.append(f"entry {eid}: " + "; ".join(problems))
        else: ok += 1
    by = {}
    for e in lib.get("entries", []): by[e.get("topic")] = by.get(e.get("topic"), 0) + 1
    print(f"{family}: {ok} of {len(lib.get('entries', []))} entries pass, {len(sources)} sources")
    print("by topic:", ", ".join(f"{k} {v}" for k, v in sorted(by.items(), key=lambda kv: -kv[1])))
    for b in bad[:60]: print("  FAIL", b)
    if len(bad) > 60: print(f"  ... and {len(bad) - 60} more")
    sys.exit(1 if bad else 0)


main()
