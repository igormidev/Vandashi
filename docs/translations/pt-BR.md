# Brazilian Portuguese desktop catalog review

Completed on 2026-09-23 against `/tmp/vandashi-translations/english.json`.

## Scope and evidence

- Read the full original `genesis_prompt.md`, repository `AGENTS.md`, and the acceptance-contract sections of `docs/REQUIREMENTS.md`, including the translation requirements and the product's distinction between branding, packaging, narrative scripts, independent clips, and publication.
- Read all 653 source strings and reviewed all translated strings in a second pass after drafting.
- Inspected actual consumers: `ModelPicker.tsx`, `AssetImport.tsx`, `PackagingPage.tsx`, `LaunchRow.tsx`, `ClipTimeInput.tsx`, and the result counter in `AssetsPage.tsx`. Checked `src/application/studio.ts` for the source-change diagnostic's actual meaning.
- Kept output confined to this temporary pt-BR directory. No repository edits, commits, builds, or GUI operations were performed. The upstream English implementation checkpoint was supplied by the parent task and was not reverified by this translation task.
- Automated validation passes for exact namespace key sets (382 UI, 264 messages, 7 native), no duplicate keys, nonempty string values, exact interpolation-token multiplicity, and preserved Markdown emphasis delimiters.
- Final validation additionally checks NFC normalization, the eight unchanged language autonyms, protected product names/commands, and all four `_one`/`_other` counter pairs.
- This is a linguistic/source-context review. Actual app layout, native dialog fit, glyph rendering, and interactive language switching still need the integrating task's GUI checks.

## Terminology and context

| English concept | Portuguese choice                | Rationale                                                                                                                                                        |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand           | Marca                            | The creator/channel identity and its shared style, not an employer or organization.                                                                              |
| Packaging       | Apresentação                     | The video's titles, descriptions, tags, and thumbnails. Avoids suggesting physical shipping. All tab references use the same wording.                            |
| Launch suite    | Publicação                       | The platform review/upload destination area. Upload actions are `Preparar envio`, preserving the distinction between preparing an unsent request and publishing. |
| Script          | Roteiro                          | Narrative and scene instructions, never application code.                                                                                                        |
| Clips           | Cortes                           | Natural Brazilian creator terminology for independent excerpts, consistent in list, creation, import, and diagnostics.                                           |
| Assets          | Recursos                         | Covers reusable images, audio, video, and other supported materials. Shared assets are `Recursos compartilhados`.                                                |
| Thinking effort | Raciocínio                       | The model setting; live thinking status is `Pensando`. Effort values agree with the masculine noun.                                                              |
| Read only       | Somente leitura                  | Explicitly prohibits editing. Its help text says files will not change.                                                                                          |
| Checkpoint      | Ponto de restauração             | Clearly communicates a recoverable saved state. Conversation turn is `interação`.                                                                                |
| Thumbnail       | Miniatura                        | Standard Brazilian video-publishing terminology; first/main candidate and alternatives retain their distinctions.                                                |
| Speech model    | Modelo de reconhecimento de fala | Clarifies the local inspection model's function. No narration/TTS feature is implied.                                                                            |

`Git`, `Codex`, `Hyperframes`, `Hyperframes Studio`, platform names, `Node.js`, `FFmpeg`, `FFprobe`, `Chrome`, commands, executable/environment-variable names, and the literal example folder name `the-hidden-city` remain unchanged. Technical Git `commit` and Codex `skill` terminology is retained where referring to the actual mechanism. Common Brazilian interface terms `Tags`, `Status`, and the supported reasoning level `Ultra` intentionally equal English spellings.

Recovery messages consistently preserve the distinction between changes already saved/preserved and work that will be preserved after shutdown. A created clip remains saved even if AI generation did not start. Storage transaction publication failures are rendered as failure to finish import/project creation, not mistaken for an upload failure. Native close actions distinguish continuing work from closing despite unsaved work.

No user content, provider output, history text, or source templates were translated. All language autonyms are identical to the source. The 0.1-second clip limit uses the Brazilian decimal comma in prose without changing numeric meaning.

## Plural and interpolation review

- `assetCount`: `{{count}} recurso` / `{{count}} recursos`.
- `assetFolderCount`: `{{count}} pasta` / `{{count}} pastas`.
- `assetImportRemaining`: `{{count}} restante` / `{{count}} restantes`.
- `clipListCount`: `{{count}} corte` / `{{count}} cortes`.

All four `_other` strings are grammatically valid for the Portuguese Intl `many` category when the count is numeric (for example, `1000000 recursos`). The integrating task can alias `_many` to `_other`; no distinct translated form is needed. The catalogs deliberately retain the exact English key set.

Node's `Intl.PluralRules('pt-BR')` was checked directly: 0 and 1 select `one`, 2 selects `other`, and 1000000 selects `many`. For idiomatic Brazilian UI, zero should display `0 recursos`, `0 pastas`, `0 restantes`, and `0 cortes`. Recommended integration: alias `_zero` to `_other` for these same four counters, rather than changing the source-key contract. The visible asset counter can receive zero, as confirmed in `AssetsPage.tsx`.

Unpluralized inspection notes use grammatical count-neutral phrasing: `Quadros usados na descrição: {{count}}` and the invariant unit `s` for `{{seconds}}`. This avoids `1 quadros` or `1 segundos` without adding keys. Dynamic names in status labels use a middle-dot separator to avoid gender/article assumptions about platform and user-provided names.

## Remaining integration checks

No unresolved translation-blocking ambiguity. Review especially the longer shared-assets label, model/speech inspection progress text, native close dialog buttons, and chapter guidance at the minimum window size. Verify runtime zero/many counter forms alongside 1 and 2 when integrating these files.
