# French catalog review

Completed: 2026-09-23. Scope: French desktop catalogs only; no repository changes, build, Git operation, or GUI verification.

## Deliverables

- `ui.json`: 382 entries.
- `messages.json`: 264 entries.
- `native.json`: 7 entries.

## Context reviewed

Read the complete original `genesis_prompt.md` and `AGENTS.md`, the English input catalog, and product requirements context. Reviewed consumers in `Settings.tsx`, `ModelPicker.tsx`, `PackagingPage.tsx`, `LaunchRow.tsx`, `AssetImport.tsx`, `ClipCreation.tsx`, and `ChapterEditor.tsx`. Checked diagnostic call sites in asset inspection, speech features, Studio startup, and finished-video storage when their wording needed context.

## Terminology and contextual choices

- Brand → **Marque**, representing the creator’s channel/identity across platforms, not a commercial-product assumption.
- Packaging → **Présentation**: the video’s titles, descriptions, tags and thumbnails. Both navigation and diagnostics use this term.
- Launch → **Publication**. Upload-in-progress is **Transfert en cours**, distinct from completed publication.
- Script → **Scénario**, the narrative/video plan. Literal commands, identifiers and filename examples remain unchanged.
- Assets → **Ressources**; shared assets → **Ressources partagées**; library → **Bibliothèque**.
- Clips → **Extraits**, with their own editing and publishing flow.
- Thinking selector → **Raisonnement**; progress state → **Réflexion en cours**. Level labels agree with the masculine “raisonnement”.
- Read only → **Lecture seule**, with explicit wording that files are not changed.
- Technical Git contexts retain **commit** and **SHA**. The higher-level save dialog uses **Enregistrer une version**. Recovery checkpoints are **points de restauration**; the staged script explicitly mentions the **index Git**.
- Storage publication failures use **finaliser**, avoiding confusion with uploading a video to a platform.
- Provider/process diagnostics preserve their technical context and recovery guarantees. No speculative recovery advice was added.
- Formal “vous” and concise imperative button labels are used consistently. French decimal/unit conventions use `0,1 seconde` and `Mo`, preserving the original numeric constraints.

## Review evidence

After contextual proofreading, Python validation passed for all three JSON files:

1. Exact source key sets: 382 UI, 264 diagnostics, 7 native.
2. Strict duplicate-key detection: no duplicate keys.
3. Exact `{{interpolation}}` token multiset per entry: no changes or omissions.
4. Markdown `**` emphasis marker parity: preserved.
5. No empty values or TODO/FIXME/TBD placeholders.
6. All eight language autonyms remain exactly unchanged.
7. Explicit literal checks passed for `npm run dev`, `codex login`, `VANDASHI_CODEX_PATH`, `codex.exe`, `browser`, `unified-computer-use`, `the-hidden-city`, and `A/B`.
8. Unchanged source/target strings were reviewed: they are autonyms, product names, ratios, shared French/English terms (e.g. Description, Audio, Images), model-level terms, or the platform/name formatting pattern.

All singular/plural key pairs are retained. The four `_other` forms are grammatically valid for the French `many` category and may be reused by the root’s runtime aliases:

- `assetCount_other`: `{{count}} ressources`
- `assetFolderCount_other`: `{{count}} dossiers`
- `assetImportRemaining_other`: `{{count}} fichiers restants`
- `clipListCount_other`: `{{count}} extraits`

For example, `1 000 000 ressources` is correct. No separate French `many` wording is required. The source-only inspection counters have neutral label/unit constructions to avoid incorrect singular agreement when the count or sampled duration is one.

## Remaining verification

No unresolved translation ambiguity. Integration, font coverage, wrapping, native dialogs and actual locale switching need the root’s app-level verification; this static catalog review does not claim those checks have run. User content, provider output, history and creative templates were not translated.
