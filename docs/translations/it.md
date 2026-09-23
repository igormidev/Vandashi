# Italian translation review

## Scope and product context

Prepared the Italian desktop catalogs from `/tmp/vandashi-translations/english.json`: 382 UI keys, 264 application-message keys, and 7 native-dialog keys (653 total). The full original `genesis_prompt.md` and `AGENTS.md` were read, together with the requirements covering product scope and localization. English implementation completion and authorization to begin translation were supplied by the integrating agent.

Only `/tmp/vandashi-translations/it/ui.json`, `messages.json`, `native.json`, and this review file were written. No repository files, user content, project templates, chat history, provider output, or upstream Hyperframes strings were translated.

## Terminology and contextual decisions

- **Brand** stays `brand` (plural also `brand`), familiar Italian creator/marketing terminology for the channel's identity; onboarding explains the channel relationship.
- **Packaging** is `Dettagli di pubblicazione`, covering titles, descriptions, tags, and thumbnails. **Launch** is `Pubblicazione`. The former is preparing the presentation and the latter is the actual release workflow. All diagnostics referring to these screens use their translated UI names.
- **Script** is `copione`, explicitly a narrative video document rather than application code. **Editing** is `montaggio` for video editing. **Assets** are `risorse`; **thumbnails** are `miniature`.
- **Clips** are `clip` in singular and plural, feminine in Italian, and remain independent excerpts. The selection-duration label uses `Selezione: {{duration}}` to avoid incorrect agreement with an unknown duration string.
- The model's **Thinking** selector is `Livello di ragionamento`; the activity section is `Ragionamento`. **Read only** is `Sola lettura`, with help explicitly forbidding file changes.
- **Checkpoint** is `punto di ripristino`; Git `commit`, SHA, `repository`, and `staging` retain the technical distinction needed in recovery messages. Storage-transaction publication is `finalizzare`, so it cannot be mistaken for uploading a video to a platform.
- Inspected `PublishReview.tsx`: its prepared-draft unlock action is `Modifica bozza`, avoiding the literal and misleading `Modifica revisione`.
- Inspected `ChatImage.tsx`: image retry reloads an existing image, so the label is `Riprova a caricare l’immagine`, not an instruction to regenerate it.
- Brand/shared asset badges use feminine `Condivisa` to agree with `risorsa`.
- Native close text preserves the distinction between continuing work and closing despite unsaved work. File filter labels are translated while file formats remain untouched.

## Review evidence

Reviewed UI consumers in `ModelPicker.tsx`, `PackagingPage.tsx`, `AssetImport.tsx`, `AssetsPage.tsx`, `AssetInspector.tsx`, `ClipsPage.tsx`, `PublishReview.tsx`, and `ChatImage.tsx`. Inspected media startup/inspection message contexts to avoid translating a closed service as a successfully finished inspection or a readiness timeout as successful startup.

Performed a second language pass covering grammar, imperative tone, noun gender, save/discard/undo differences, video orientation, rendering versus uploading, recovery preservation claims, and consistency between UI labels and actionable diagnostics. Literal product names, plugin identifiers, `npm run dev`, `codex login`, `codex.exe`, `VANDASHI_CODEX_PATH`, `the-hidden-city`, aspect ratios, versions, and A/B notation are preserved. All eight language autonyms remain exactly as supplied.

Programmatic verification parsed each JSON catalog with duplicate-key detection and checked exact source-key equality, string/nonempty values, exact interpolation-token multisets, and the number of Markdown emphasis delimiters. All checks passed for all 653 entries. Unchanged strings were reviewed: they are product/platform names, autonyms, established Italian loanwords, numeric formats, or interpolation-only labels, not untranslated prose.

## Plurals and integration

The source keys remain exactly `_one` and `_other`. Reviewed counts 0, 1, 2, and 1,000,000 for all four families:

| Family               | `_one`                     | `_other` / suitable `_many` alias |
| -------------------- | -------------------------- | --------------------------------- |
| assetCount           | `{{count}} risorsa`        | `{{count}} risorse`               |
| assetFolderCount     | `{{count}} cartella`       | `{{count}} cartelle`              |
| assetImportRemaining | `{{count}} file rimanente` | `{{count}} file rimanenti`        |
| clipListCount        | `{{count}} clip`           | `{{count}} clip`                  |

All four `_other` wordings work unchanged for Italian's `many` category, including the compact numeral-based count at 1,000,000. The integrating agent can alias `_many` to `_other`; no Italian-specific variation is needed.

No unresolved semantic ambiguities. `Dettagli di pubblicazione` is intentionally explicit but longer than English `Packaging`; review this tab and the clip packaging heading at minimum window width. The integrating agent owns builds, runtime locale behavior, actual app layout/wrapping, and native dialog verification. This review makes no claim that those integration checks were performed by the translation agent.
