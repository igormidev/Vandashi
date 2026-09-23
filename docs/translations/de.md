# German desktop translation review

Completed all 653 English-source entries: 382 UI strings, 264 application diagnostics, and 7 native strings. The three JSON files are flat dictionaries, retain source key order, and contain no fallback filler.

## Terminology and voice

- Informal singular address (`du/dein`) in guidance and diagnostics; compact infinitive labels for actions.
- **Brand → Marke**: a creator identity that can span channels/platforms. The creation help explicitly mentions the channel to make this meaning clear.
- **Packaging → Aufmachung**: the outward presentation of the video (titles, descriptions, tags, thumbnails), not shipping or a presentation/slideshow document. The initial draft used `Präsentation`; final review changed all related UI and diagnostic occurrences to `Aufmachung` for clearer context.
- **Assets → Medien**, singular **Medium**: covers images, audio and video without retaining English asset jargon. File-specific messages say `Mediendatei`. Shared assets are `Gemeinsame Medien`; their library scope remains distinct.
- **Script → Skript**: a narrative/video script. **Editing → Schnitt** in creative guides; manual-editor actions use `bearbeiten`.
- **Creation workspace → Gestaltung** and **Launch suite → Veröffentlichen** keep navigation compact. The import action is `Importieren & Upload vorbereiten`, which opens upload preparation and does not imply automatic publication.
- **Thinking → Denkaufwand** for the effort selector, but **Denkt nach** for active reasoning. **Read only → Nur lesen**, with help explicitly stating that files are not changed.
- **Turn → Gesprächsschritt**, **checkpoint → Sicherungspunkt**, **staged → zum Commit vorgemerkt** retain the file/history recovery distinctions.
- **Thumbnail → Vorschaubild**; **preview → Vorschau**. Main image and A/B variants remain distinguishable.
- Storage transaction `publish` is rendered as completing/providing the local import/project, avoiding confusion with social-platform publication.
- Standard German technical vocabulary is retained where appropriate: Browser, Tags, Clips, Commit, Repository, Rendern, Cache, Skill, Cursor, Loopback. Literal plugin identifiers `browser` and `unified-computer-use` are unchanged.

## Context and length review

Read the original product brief in full, AGENTS.md, and relevant requirements. Inspected the actual consumers for the import-and-launch CTA, asset description label, framing guide, launch review edit action and reasoning levels. Also confirmed the Studio location diagnostic refers to a local URL.

Shortened the asset-description label to `Was enthält dieses Medium?` and the import CTA to `Importieren & Upload vorbereiten`. Navigation remains short; longer help and diagnostic text uses complete, actionable German sentences. The framing guide is an accessibility label, so its longer explicit wording does not consume visible layout space. No cryptic abbreviations were introduced.

German plural pairs retain every `_one`/`_other` key. `Medium/Medien` and `Clip/Clips` vary; `Ordner` and `übrig` are naturally identical in both forms. German decimal text uses `0,1` where the value is explanatory copy; ratios, commands, identifiers and the example filename remain literal.

## Validation

- Exact key parity and namespace counts checked against `/tmp/vandashi-translations/english.json`.
- Every value is a nonempty string; no added or omitted keys.
- Every `{{interpolation}}` token is preserved exactly with matching multiplicity.
- All Markdown bold markers preserved.
- All language autonyms, including English, remain unchanged.
- Identical English/German values manually reviewed: only proper product/platform names, language autonyms, valid German cognates, ratios, the literal version and the placeholder-only platform/name pattern.
- No user content, generated prompts, templates, files, repository sources or Git state edited. No GUI/builds were launched. Integration, font and actual narrow-pane layout verification belong to the root task.
