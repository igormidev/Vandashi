# Spanish catalog review

Reviewed 2026-09-23 against `/tmp/vandashi-translations/english.json` from the accepted English checkpoint identified by the coordinator as `f4cb2f7`.

## Deliverables

- `ui.json`: 382 flat keys.
- `messages.json`: 264 flat keys.
- `native.json`: 7 flat keys.
- Total: 653 translated catalog entries. No repository files, provider output, user documents, starter templates, or saved history were changed.

## Context and terminology

Read the complete original `genesis_prompt.md` and `AGENTS.md`, and the requirements checklist and evidence relevant to the application workflows. Reviewed actual consumers in `PackagingPage.tsx`, `ModelPicker.tsx`, `Settings.tsx`, `ClipCreation.tsx`, `PublishReview.tsx`, and `AssetImport.tsx` to distinguish labels, compact controls, format selectors, narrative scripts, metadata, model controls, and temporary upload review drafts.

- **Brand → Marca**: a creator/channel identity with reusable creative preferences.
- **Packaging → Presentación**: titles, descriptions, tags, and thumbnails. This label consistently appears in the tab, clip editor, upload guidance, and diagnostics. It does not mean shipping or a software package.
- **Launch suite → Publicación**: also used by navigation references such as “Importar y abrir Publicación.” Upload itself is “subida” / “subir”; the pending, uploading, and published states remain distinct.
- **Script → Guion**: narrative and creative instructions; never application code. Modern spelling without an accent.
- **Assets → Recursos**: consistent across local/shared libraries, metadata, import, references, and errors.
- **Clips → Clips**: independent short excerpts with their own editing context. “Video de origen” consistently identifies the parent/source video.
- **Thinking → Razonamiento** for the selector; **Razonando** for the active status. Effort values agree grammatically with “razonamiento.”
- **Read only → Solo lectura** and **Allow edits → Permitir cambios** preserve the actual write restriction.
- **Commit → commit** in technical Git controls/errors; user-facing save/history actions retain “versión.” Checkpoints are “puntos de restauración,” and staging is explicitly “preparado para el commit.”
- **Render → Renderizar**: preserves the distinction between previewing a composition, producing a video file, and uploading it.
- Speech sampling uses “reconocimiento de voz” and explicitly retains uncertainty in sampled frames and transcripts.

Use familiar, broadly understandable Spanish with informal singular imperatives and “video” throughout. Native close-dialog wording accurately preserves the unsaved/background-operation risk and the choice to keep working.

Internal filesystem publication failures use “completar la importación/creación” to avoid suggesting an external upload. The messages retain the preserved-file paths, retry conditions, and prohibition on overwriting existing work. No unresolved contextual ambiguity remains in this catalog.

## Review and validation evidence

A Python JSON validation pass parsed each file with an `object_pairs_hook` that rejects duplicate keys, compared exact key sets against each English namespace, rejected nonstring or empty values, compared interpolation token multisets per entry, and checked Markdown `**` delimiter parity. Results: 382/382 UI, 264/264 messages, 7/7 native; no missing/extra/duplicate/empty keys, no interpolation mismatches, and no emphasis mismatches.

All eight language autonyms are byte-for-byte unchanged. Product/platform names, literal ratio values, the example folder name `the-hidden-city`, `npm run dev`, `codex login`, `VANDASHI_CODEX_PATH`, `codex.exe`, and the `browser` / `unified-computer-use` plugin identifiers are preserved.

Unchanged English-equal values were inspected: they are autonyms, product/platform names, shared Spanish spellings (Videos, Clips, General, Audio, Video, Ultra), ratios, the numeric clip counter, or the platform/name interpolation-only label. There are no untranslated English sentences or filler values.

The four `_one` / `_other` counter pairs preserve correct agreement. The `_other` strings are also suitable for Spanish Intl/i18next **many** results when the count is displayed numerically: `{{count}} recursos`, `{{count}} carpetas`, `{{count}} pendientes`, and `{{count}} clips`. Runtime `_many` aliases may use these strings unchanged; no extra keys were added to the exact-source catalog.

This is a contextual language/catalog review. It does not claim a GUI layout check, native dialog rendering check, build, or integration run; those remain with the integrating coordinator.
