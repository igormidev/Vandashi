# Localization readiness audit

Audit date: **2026-09-23**. This is a read-only production-code audit; only this document
was added. No translations, locale migration, dependency installation, or native UI
interaction were performed. The original brief permits scaffolding now and requires
actual translation work to wait until the application is complete.

**Implementation update, 2026-09-23:** the original audit below is retained as a historical
inventory. The typed boundary is now implemented in `domain/diagnostics.ts` and the
English catalogs under `domain/messages/`. Application guards, publishing/chapter
validation, prompt scope validation, Codex adapter failures and withheld-request notices,
chat recovery notices, persisted chat errors, and application dependency diagnostics use
explicit message IDs. Dependency checks can carry a display-label descriptor separately
from their stable ID; progress events can carry the same label. Provider prose remains
external, including when it happens to equal an English catalog sentence. Existing
persisted messages without descriptors retain their raw fallback text. Storage, Git,
desktop, and media producers now use the same typed boundary. Native filter/close
text uses the cached saved locale and an English-only native catalog. These changes
introduce no translations; the historical inventory counts below are not current totals.

Renderer resources preserve literal keys and have an i18next type augmentation.
Unknown keys and incorrect supplied interpolation names are compile-time failures;
i18next's optional options overload still permits omitted UI interpolation options.
The separate `AppMessage` contract requires all named parameters. Runtime validation
checks known diagnostic IDs and exact parameter sets, while versioned IPC decoding
happens only once at the renderer boundary. Wire-size tests include worst-case JSON
escaping. Provider text that resembles a wire marker remains raw external content.
Native Electron regressions exercise the actual main/preload/contextBridge failure
envelope, including Electron's loss of custom Error fields and unchanged void success.

English counts now use plural keys; dates and percentages use the selected locale.
The document language follows i18next, known reasoning values have display labels,
and launch accessible labels use complete parameterized phrases. Tests reject
duplicate source keys and cover English fallback. Actual language resources and
language-specific layout acceptance remain deliberately pending app completion.

The native locale scaffold now centralizes `en`, `ja`, `fr`, `es`, `de`, `ko`, `pt-BR`,
and `it` in `domain/locales.ts`. Both settings schemas use that canonical list, and
`Settings.locale` is its union type. Normalization accepts language/region variants,
maps Portuguese variants to Brazilian Portuguese, and falls back to English for
unsupported or malformed values. Persistence and IPC still require canonical IDs.
Only English is resource-available and selectable. `desktop/messages.ts` exposes a
typed, pure, synchronous native resolver for close-dialog and file-filter labels;
the main process can pass its cached saved locale without importing renderer i18next.
Recovery fallbacks use the same domain source messages as their diagnostic descriptors.
`tests/locales.test.ts` covers normalization, shared validation, and English fallback.

## Conclusion

The renderer has a useful English-key scaffold, but translating its resource files
alone would leave many app-owned messages in English. The missing boundary is a
serializable, typed distinction between an application message and external text.
Introduce that boundary before translating diagnostics; do not build a dictionary
that recognizes English error sentences at runtime.

The brief requires English plus Japanese, French, Spanish, German, Korean, Brazilian
Portuguese, and Italian, with English fallback. Hyperframes Studio may retain its
upstream language. User files, names, source text, and provider output are a different
category from app-owned controls and must not be silently translated.

## Current English scaffold

The inventory below was obtained with the installed TypeScript parser over `src/**/*.ts`
and `src/**/*.tsx`. It counts property assignments and call sites, not guesses from
matching English prose. Counts are a source snapshot before subsequent turn-receipt
implementation; they are not a fixed acceptance threshold.

| Resource                            | English keys |
| ----------------------------------- | -----------: |
| `src/renderer/locales/en.ts`        |          258 |
| `src/renderer/locales/assets-en.ts` |           24 |
| `src/renderer/locales/clips-en.ts`  |           22 |
| `src/renderer/locales/chat-en.ts`   |            4 |
| `src/renderer/locales/launch-en.ts` |           25 |
| **Total**                           |      **333** |

`src/renderer/i18n.ts` spreads these five objects into one namespace. There are **zero
duplicate keys** and **zero missing keys among 296 direct literal calls** in this
snapshot. There are 347 total `t(...)` calls, including 51 conditional or dynamic
expressions; a literal-only scan does not prove all those paths are complete.

The objects do not preserve literal value types, and no `i18next.CustomTypeOptions`
resource augmentation exists. An in-memory TypeScript compilation accepted all three
invalid examples: an unknown translation key, the wrong parameter name for
`checkingTool`, and omission of its parameter. No source file was created for this
probe. The architecture document's description of a “typed English source” therefore
overstates the present call-site guarantees.

The locale enum is duplicated in `src/desktop/validation.ts:84` and
`src/infrastructure/storage/schemas.ts:34`; `Settings.locale` remains an unrestricted
string in `src/domain/models.ts:120`. Only English is registered and selectable, which
is appropriate for the current phase. `AppProvider.refresh` changes the renderer
language after settings load. A saved supported non-English locale currently falls
back to English resources; startup does not detect the device language. The HTML
element remains `lang="en"` after a language change. Device-language detection for the
later landing page is outside this app audit.

## Messages outside renderer keys

There are **189 non-renderer `new Error` / `new AgentError` call sites in 40 files**:
171 direct string/template arguments, 11 expressions containing app-written fallback
text, and 7 dynamic arguments. The dynamic group includes two chapter-message table
lookups as well as propagated errors. These are call-site counts, not 189 unique
translation units or a claim that every low-level error reaches the user.

| Layer            | Files | Direct | Fallback expressions | Dynamic arguments | Total |
| ---------------- | ----: | -----: | -------------------: | ----------------: | ----: |
| Application      |    10 |     49 |                    6 |                 3 |    58 |
| Desktop          |     4 |     22 |                    0 |                 0 |    22 |
| Domain           |     1 |      2 |                    0 |                 0 |     2 |
| Codex adapter    |     7 |     16 |                    0 |                 2 |    18 |
| Git adapter      |     1 |      7 |                    0 |                 0 |     7 |
| Media adapters   |     8 |     29 |                    5 |                 2 |    36 |
| Storage adapters |     9 |     46 |                    0 |                 0 |    46 |

Precise per-file constructor inventory, for implementation planning:

| Directory                    | File: number of call sites                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/application`            | `agent-json.ts`: 1; `automation.ts`: 2; `backend.ts`: 2; `chat-undo.ts`: 4; `chats.ts`: 9; `commits.ts`: 5; `operation-gate.ts`: 1; `publishing.ts`: 24; `studio.ts`: 9; `workspaces.ts`: 1 |
| `src/desktop`                | `main.ts`: 3; `path-permissions.ts`: 5; `studio-host.ts`: 4; `validation.ts`: 10                                                                                                            |
| `src/domain`                 | `prompts.ts`: 2                                                                                                                                                                             |
| `src/infrastructure/codex`   | `binary.ts`: 1; `client.ts`: 5; `discovery.ts`: 2; `execution.ts`: 1; `history.ts`: 1; `schemas.ts`: 1; `transport.ts`: 7                                                                   |
| `src/infrastructure/git`     | `local-git.ts`: 7                                                                                                                                                                           |
| `src/infrastructure/media`   | `compositions.ts`: 4; `diagnostics.ts`: 1; `hyperframes.ts`: 6; `render.ts`: 7; `runtime.ts`: 3; `studio-bridge.ts`: 3; `studio-process.ts`: 7; `waveform.ts`: 5                            |
| `src/infrastructure/storage` | `asset-references.ts`: 1; `assets.ts`: 10; `brand-image.ts`: 3; `embedded-metadata.ts`: 3; `files.ts`: 3; `local-storage.ts`: 15; `projects.ts`: 8; `registry.ts`: 2; `yaml-files.ts`: 1    |

Other producers need explicit treatment; scanning constructors alone misses them:

| Surface and producer                                                                                                          | Present behavior                                                                                                                                                                                 | Localization action                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPC: `src/desktop/main.ts:157`, `src/desktop/preload.ts:5`, `src/renderer/app/store.tsx:47`                                   | Backend exceptions become rejected Electron invocations; the renderer displays `.message` or `String(error)` in a toast.                                                                         | Return an explicit failure envelope carrying an app message descriptor and separate external details. Custom Error properties alone are insufficient across this boundary.         |
| Notices: `application/chats.ts:77,225,281,326,329,335`; `desktop/main.ts:50,177`                                              | Eight emission sites use seven codes. Four fixed details and the two recovery variants are app prose; other details can be raw errors. `store.tsx:111` ignores the code and displays the detail. | Type each notice payload, using a descriptor for owned prose and a distinct raw-detail field. `agent-warning` alone cannot identify ownership.                                     |
| Native close dialog: `desktop/messages.ts:3`, consumed at `desktop/main.ts:196`                                               | Five centralized English close-dialog strings; the same file has two recovery-message variants.                                                                                                  | Use a framework-free shared message catalog and a main-process translator initialized from saved settings. Preserve synchronous close behavior and default/cancel button ordering. |
| Native file filters: `desktop/main.ts:124`                                                                                    | Two app-owned filter names, Images and Video, are hardcoded. Native picker chrome is OS-owned.                                                                                                   | Translate only the supplied filter names; keep file extensions and OS behavior unchanged.                                                                                          |
| Dependency details: `application/dependencies.ts`, `infrastructure/media/diagnostics.ts`                                      | Seven app-written detail fragments coexist with versions, paths, raw exceptions, and upstream doctor output.                                                                                     | Store a diagnostic ID plus typed message or external detail. Preserve upstream reports verbatim under a translated label.                                                          |
| Dependency labels: same producers and `renderer/features/workspace/Checks.tsx:105`                                            | The UI renders `check.id`. Nine possible IDs include `media-nodejs`, `media-ffmpeg`, `media-ffprobe`, `media-chrome`, `media-environment`, and `skill`. Progress also sends display strings.     | Keep IDs stable for repair topics; map IDs to display descriptors. Product names such as Codex, Git, Chrome, and Hyperframes remain proper names.                                  |
| Reasoning selector: `renderer/features/chat/ModelPicker.tsx:57`                                                               | Known levels and fallback levels are rendered as raw strings. Model names are provider text.                                                                                                     | Map supported known reasoning tokens to keyed labels. Preserve wire values and display an unknown future token verbatim; do not translate model IDs/names or coerce capabilities.  |
| Chapter validation: `domain/launch.ts:5`, `application/publishing.ts:14`, `renderer/locales/launch-en.ts:16`                  | Six stable issue IDs already exist, but backend and renderer maintain different English wording for them.                                                                                        | Reuse one issue-to-message descriptor mapping; no comparison of the two English sentences.                                                                                         |
| Codex warnings: `infrastructure/codex/events.ts:117`                                                                          | Raw server warnings and the app-generated withheld-action warning share a string field.                                                                                                          | Preserve provenance at creation. Translate the wrapper for a withheld request; keep method/tool identifiers and external warning text unchanged.                                   |
| Studio bridge: `infrastructure/media/studio-bridge.ts`                                                                        | JavaScript bridge failures can be strings returned by injected code; local wrapper errors and upstream errors are mixed.                                                                         | Return a stable code for app-authored bridge states and preserve upstream save details separately.                                                                                 |
| Generated content: `application/commits.ts:85`, `application/chats.ts:126`, `storage/projects.ts`, `storage/local-storage.ts` | App defaults include persisted commit prose, system-created conversation titles, and instructions shown in chat.                                                                                 | Separate future UI labels from persisted historical content. Never rewrite old commits, user titles, existing guides, or agent messages when the UI language changes.              |

Launch statuses already use keyed labels for all four values (`not_started`, `uploading`,
`uploaded`, `failed`). Chat reasoning/tool section labels and active-operation labels
are also keyed. These are useful patterns to retain rather than replacing all dynamic
labels indiscriminately. Render detail and tool output remain potentially external
text even when they happen to be English.

## Minimal maintainable mechanism

1. **Define an app-message contract in the domain.** A discriminated union couples a
   stable semantic ID to its parameter shape, for example a missing-file message with
   a path, or a restored-file notice with a backup path. A shared pure English catalog
   can live beside the domain contract and be consumed by both renderer and desktop.
   It imports no React, Electron, or i18next. Later language resources follow the same
   key/parameter contract. Do not put renderer translation keys inside low-level logic.
2. **Keep ownership explicit.** An app failure contains a message descriptor and an
   optional bounded external diagnostic. Raw provider errors, model output, stderr,
   file paths, and user content are never sent through a translation lookup. An
   `AppFault` can retain an English fallback for logs, but its descriptor is the
   authoritative machine-readable identity. For a mixed message, localize the app's
   wrapper and show the original diagnostic separately.
3. **Serialize failures deliberately.** Use a validated result envelope for IPC:
   success with a value, or failure with a descriptor and optional external detail.
   The preload can preserve the current Promise API by reconstructing a local typed
   error. Do not rely on Error subclass fields surviving Electron serialization.
   Electron explicitly documents that errors thrown through `ipcMain.handle` do not
   preserve the original error, only its message. [Electron IPC documentation](https://www.electronjs.org/docs/latest/api/ipc-main).
4. **Render at the presentation edge.** Toasts, app-generated chat receipts, dependency
   rows, and notices resolve descriptors using the current renderer locale. Store
   descriptors rather than already-translated toast strings when a language change
   should update visible text. Main-process native dialogs resolve the same catalog
   with the saved locale; they do not import renderer modules. Centralize locale IDs
   and normalization to avoid divergent desktop/storage enums.
5. **Migrate by producer, with tests.** Start with application guardrails, recovery
   notices, dependencies, and native dialogs. Then wrap adapter failures at their
   source, retaining original external diagnostics. Do not classify a failure by
   `.includes(...)`, regular expressions over prose, or an English-sentence map.
   Existing protocol error-code handling is a separate concern and can remain.

For a new deterministic save receipt, an optional app-message descriptor on
`ChatMessage` can coexist with its English fallback text and actual file diffs. Only
that app-generated record should use the descriptor; original agent prose stays
verbatim. This is a small additive starting point, not a prerequisite to translate
all existing backend errors at once.

## Key typing, duplicates, and formatting

- Preserve literal English resource types and augment i18next's `CustomTypeOptions`
  from the **merged** resource, not just `en.ts`. Keep the current string-key API on
  installed i18next 25.10.10; a selector migration is unnecessary for this scaffold.
  Add compile-time negative cases for unknown keys and required parameters. The
  official setup uses resource type augmentation and literal resources. [i18next TypeScript guide](https://www.i18next.com/overview/typescript).
- Use an explicit typed map for dynamic domains such as platform, launch state,
  asset kind, chapter issue, and known reasoning level. Arbitrary strings from a
  provider must not be asserted into the translation-key union.
- There are five duplicate-value pairs, but no duplicate keys: `videos`/`video`,
  `creativeDirection`/`clipPrompt`, `sections`/`chapterModel`, `reasoning`/`thinking`,
  and `dependencyMissing`/`failed`. They have distinct contexts and should not be
  merged solely because the English happens to match. The last pair especially
  describes different states. Add translator context. Separately consolidate the
  six duplicated chapter error meanings across backend and renderer.
- Twelve keys contain interpolation. Count-bearing `assetCount`, `assetFolderCount`,
  and `clipListCount` have no plural forms and currently produce English such as
  “1 assets”. `assetImportRemaining` also needs language-specific grammatical review.
  Use i18next plural forms with numeric `count`; languages do not all use the English
  singular/plural split. [i18next plural documentation](https://www.i18next.com/translation-function/plurals).
- `checkPercent` embeds a literal percent sign. Use locale-aware percentage formatting
  with a consistent input scale; an integer 50 and a fraction 0.5 are not equivalent
  inputs. `History.tsx:75` formats dates using the OS default rather than the selected
  app locale. `AssetInspector.tsx:11` already passes the locale to `Intl.NumberFormat`
  for file-size units and is a good existing example.
- Preserve canonical media timecodes and serialized chapter syntax. `clip-range.ts`
  and `domain/launch.ts` intentionally emit punctuation-based time values; do not
  translate persisted timestamps or protocol numbers. Surrounding units, labels,
  ordinal descriptions, and visible durations can be locale-aware.
- `LaunchRow.tsx:34,76,92` concatenates labels with punctuation and a fixed word order.
  Use complete keyed phrases with named parameters for accessible labels. Do not
  assemble sentences from separately translated fragments.
- `escapeValue: false` is appropriate for text rendered safely by React; it must not
  justify raw HTML injection. `InfoTip` intentionally permits a small Markdown subset.
  Later translation checks must retain valid emphasis syntax and meaningful plain
  accessible labels, and must not turn interpolated user content into Markdown syntax.
- Update the document language with the selected locale. Review actual Japanese
  kanji/kana and Korean Hangul font fallback, line wrapping, keyboard composition,
  narrow layouts, and tooltip expansion during the later language-specific review.

The current lint rule applies only to renderer `.tsx` markup. It cannot catch English
constructed in `.ts` helpers, backend notices, returned labels, native dialogs, or
already-computed JSX expressions. Extend checks around message-producing boundaries
and typed descriptors; a blanket ban on all string literals would also flag valid
paths, protocol tokens, CSS classes, commands, and user-facing technical identifiers.

## Focused verification for the eventual scaffold change

Keep translation work gated on completion of the app. English-only scaffold tests
can already verify: an app fault preserves ID/parameters across IPC; an unknown raw
tool error is shown verbatim beneath a keyed wrapper; a recovery notice preserves its
path; a native close dialog keeps safe button semantics; existing chat records load
without a descriptor; all catalog keys and interpolation parameters agree; duplicate
keys cannot silently overwrite one another; and plural/count formatters handle zero,
one, and several. Use synthetic test resources for fallback behavior rather than
claiming to have completed any target-language translation.

This audit used source inspection, TypeScript AST counts, and the in-memory type probe.
It did not execute new Electron sessions, external publishing, or translation models.

## Subsequent bounded implementation

After this read-only audit, a separately requested save-receipt feature introduced
`src/domain/messages.ts` with two English IDs and optional `ChatMessage.appMessage`
metadata. The renderer registers these under a `messages` namespace and resolves only
app-authored receipt labels through it; raw agent messages remain untouched. This is
the small additive example proposed above, not implementation of the broader diagnostic
or IPC migration. The inventory tables retain their explicitly recorded pre-receipt
snapshot. The old fixed `task-complete` toast was replaced by the persisted receipt,
which also distinguishes turns with no net file changes.
