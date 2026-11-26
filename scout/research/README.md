# Scout research library

Source-backed knowledge for Scout, the merchant support assistant planned for the Insights section. Research only:
nothing here is loaded by the server, shipped in the Docker image (which copies `server`, `shared` and `public` only),
or shown to anyone yet.

- `library/<family>.json`: entries a merchant-facing assistant can answer from. Every entry names its source and holds
  an exact quote from it. `tier` 1 is the maker's own document; `tier` 2 is another processor's or a reseller's guide
  for the same model, whose terminal software can differ from ours.
- `inventory.json`: the device ids the entries use (from the equipment sheets).
- `tools/validate.py`: checks a library file's shape and that each quote is in the saved source text. The saved source
  texts are not in the repository; re-create them with `tools/fetch.py` / `tools/crawl.cjs` from the URLs in each file.
- `BRIEF.md`: the rules the research followed.

## Review pass (rules, then samples)

- 157 entries whose steps need staff access (a parameter or key download, the processor's portal, a merchant file,
  clearing a batch, a factory reset) were re-routed to support; each carries a `review` note.
- 722 error-code entries are a bare code and meaning from a network's table, with no fix in the source. They carry
  `"meaning_only": true`: Scout may state the meaning and must not invent a fix.
- 20 online-checkout messages mistaken for terminal codes were removed.

## Not ready for Scout as it stands

- Passing the quote check proves the quote is in the source. It does not prove the rewritten `steps` or the
  `merchant_can_do` / `escalate_to` values are right. Several files built entries by script (the error-code tables
  especially) and were only spot-checked.
- Entries with `"sensitive": "password"` hold default, manager, technician or master passwords printed in public
  guides. Scout must not give these to merchants without an explicit decision.
- Sources contradict each other and the equipment sheets in places; those entries carry a `note`.
- Known thin or empty: the three Basil bundles (no entries), HotSauce, Fiserv FD150/RP10, Dejavoo P1/P8 faults, the
  Dejavoo virtual terminal, Valor VP300 Pro and RCKT, Epson TM-m30III, Union on iPhone. PAX and Clover publish no
  numbered error-code list.
