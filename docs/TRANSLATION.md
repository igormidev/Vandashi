# Translation and language verification

Actual translation began after the English checkpoint `f4cb2f7`: strict checks,
453 passing unit/integration tests, all 81 native scenarios across a full run and
corrected rerun, and fresh packaged macOS Studio/Codex/render and speech checks.
Unavailable external-account and other-OS acceptance remains explicit in
[REQUIREMENTS.md](REQUIREMENTS.md). The landing page follows desktop translation.

Each language is authored in a fresh context using the complete original brief,
the current English source catalog, and relevant component consumers. Translators
own separate language files. The product's terms have specific meanings:

- Brand is a creator's channel and shared creative identity.
- Packaging is the video's titles, descriptions, tags, and thumbnail candidates.
- Script is the narrative and visual/audio direction, not application source code.
- A clip is an independent short excerpt with its own repository and packaging.
- Thinking is the selected model's reasoning effort. Read only prohibits edits.
- Assets are reusable image, video, and audio files, including shared brand assets.
- Launch prepares and supervises an upload after the user reviews and sends it.

Use concise, natural interface language and actionable errors. Japanese uses
normal kanji and kana rather than artificial all-kanji text; Korean uses Hangul.
Preserve proper product names, literal filenames/commands, named interpolation
tokens, and meaningful Markdown emphasis. Language choices display autonyms.
Maintain every plural key, even when a language uses the same wording for multiple
forms. Numeric values use i18next plural rules and locale-aware formatters.

Application messages carry typed IDs and parameters separately from raw provider
output. UI language changes do not translate existing user documents, stored
titles, Git history, creative guides, model output, or external diagnostics.
Persisted English compatibility text remains a fallback; descriptors select the
current-language wording where available. Native dialog strings resolve
synchronously from the cached saved locale without importing renderer code.

Verification must cover exact key and interpolation parity, empty/duplicate keys,
region normalization, unsupported-language fallback, plural counts, persistence,
native dialogs, and actual rendered layouts. Review settings, long labels,
tooltips, modal buttons, disabled/error states, minimum window/pane dimensions,
and Japanese/Korean glyphs. Localized text must not widen the native minimum or
hide controls. Hyperframes Studio may retain its upstream language.

Japanese and Korean use bundled Noto Sans variable fonts so glyph availability
does not depend on an optional operating-system language pack. Fontsource's
Unicode-range subsets load the glyph ranges actually used; fonts stay local to
the app. See [Fontsource installation](https://fontsource.org/docs/getting-started/variable)
and [subset behavior](https://fontsource.org/docs/getting-started/subsets).

Language-specific editorial review and desktop layout verification are recorded
here as they finish. Creating resource files alone does not establish acceptance.

## Editorial reviews

Each of the seven fresh language contexts delivered and self-reviewed 382 interface
labels, 264 application messages, and 7 native strings. Root independently checked
the exact keys, duplicate/empty values, and interpolation tokens before integration.

| Language           | Context and terminology review                       |
| ------------------ | ---------------------------------------------------- |
| 日本語             | [Japanese review](translations/ja.md)                |
| Français           | [French review](translations/fr.md)                  |
| Español            | [Spanish review](translations/es.md)                 |
| Deutsch            | [German review](translations/de.md)                  |
| 한국어             | [Korean review](translations/ko.md)                  |
| Português (Brasil) | [Brazilian Portuguese review](translations/pt-BR.md) |
| Italiano           | [Italian review](translations/it.md)                 |

French, Spanish, Brazilian Portuguese, and Italian explicitly supply the `many`
counter category through author-reviewed aliases of their plural `other` wording;
otherwise a count such as one million would fall back to English. Brazilian
Portuguese additionally uses plural wording after numeric zero. Runtime tests
exercise 0, 1, 2, 11, 101, and 1,000,000 in all languages.

Known app-owned chat headings resolve from stable topics, independently of their
historical stored title. User clip names, asset titles, and unknown topics remain
unchanged. Preview/Studio failures and toasts retain typed descriptors until display,
so switching language updates them without restarting requests, replaying receipts,
or extending the toast dismissal timer. Native tests exercise these transitions.

At narrow Brand pane widths, name/image and platform/browser inputs stack rather
than shrinking the name field to a few characters. Chat permission selectors size
to their translated option text. Actual language layout verification covers both
split extremes at the native minimum, including original user/provider content.

## Verified desktop behavior

- The full source gate passed 490 tests, strict types, zero-warning lint, dependency
  boundaries, formatting, and production build. Thirteen platform/opt-in tests
  remain skipped in that ordinary run; separate packaged evidence is recorded elsewhere.
- The complete native Electron suite passed all 110 cases. The 29 added localization
  cases include eight language-persistence/native-dialog cases, 16 minimum-window
  layout cases, three development-StrictMode startup-failure cases, and two live-toast
  cases including exact dismissal timing and duplicate-receipt suppression.
- Three independent visual reviewers examined Japanese/Korean, French/Spanish/Italian,
  and German/Brazilian Portuguese screenshots. A Spanish tag-filter width cap was
  relaxed; all locales now have a measured-fit assertion for the selected filter label.
  A preview fixture missing its `previewUrl` was repaired to remove an unrelated error
  overlay from screenshots. These were fixture-driven layout checks, not a substitute
  for the actual packaged Studio/render integration or manual workflow.
- All 30 focused follow-up cases passed (16 language layouts, eight settings/native,
  four shared asset-component, and two pane-layout cases). Reviewers found no material
  remaining translation, glyph, overlap, or control-layout issues in the clean captures,
  including publication controls below the initial viewport. Settings screenshots
  disable their brief opening animation to capture fully opaque dialogs.

These are desktop translation checks. The separate site translations, final section
audit loop, other-OS runtime execution, and authorized external-account publishing
acceptance are not implied.

The unsigned macOS package frozen at `6795514` passed its actual bundled speech
test (6.77 seconds) and Studio/render test with real Codex script synchronization
(58.74 seconds). The packaged app was then operated directly through Settings:
English → Japanese → Korean → Brazilian Portuguese → German → French → Spanish →
Italian → English. Each saved language appeared in the real brand workspace and
on reopening Settings. Original project names and editable creative guides remained
unchanged. The Japanese glyphs and workspace layout were inspected visually; all
languages also have the native/capture evidence above. This completes desktop
language/settings acceptance, independently of the later site's browser checks.
