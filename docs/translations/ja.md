# Japanese translation review

Completed all 653 application-owned strings: 382 UI, 264 messages, and 7 native strings. Read the original `genesis_prompt.md` and `AGENTS.md`; used the English namespaces as the exact source catalog. No repository code, templates, user content, provider output, Git state, or other locale files were edited.

## Language and terminology

- Natural Japanese uses kanji with normal hiragana grammar and familiar katakana terms. The translation does not imitate Chinese or force all-kanji wording. Labels are compact; instructions and recovery messages use polite Japanese.
- **Brand → ブランド**: the creator's channel/identity, with ブランド情報 for its attributes and 制作方針 for taste/creative-direction documents.
- **Packaging → 公開用情報**: titles, descriptions, tags, and thumbnails prepared for a video. This avoids suggesting physical packaging. **Launch suite → 公開** is the upload/release workflow; messages that point to these tabs use the same names.
- **Script → 台本**: a video's narrative and scene directions, not executable code. Script synchronization is 台本の同期. **Assets → 素材**, with 共有素材 and 共有ライブラリ for the brand-wide library.
- **Clips → クリップ**: independent excerpts; their source is 元の動画. **Long/short form → 長尺動画／短尺動画**, shortened to 長尺／短尺 in chips. Ratios remain unchanged; landscape/portrait are 横長／縦長.
- **Render → 書き出す／書き出し** in workflow text, the familiar Japanese video-export action. Technical diagnostics retain レンダラー when referring to the actual rendering process. **Composition → コンポジション** remains distinct from finished imported video.
- **Thinking (effort selector) → 思考の深さ**; **Thinking (progress) → 思考中**. Effort levels remain distinct: なし／最小／低／中／高／非常に高い／最大／ウルトラ. `Ultra` is deliberately transliterated so it is not collapsed into Maximum.
- **Read only → 読み取り専用**, with the help explicitly prohibiting file changes. The shared AI button is AIと一緒に進める, allowing both discussion and editing rather than promising an edit in read-only mode.
- **Turn → やり取り** in user-visible recovery errors. Git checkpoint terminology remains チェックポイント; staged scripts remain ステージング済みの台本. “Saved” and “will be preserved” are kept distinct where the English makes that distinction.
- **Publish in storage-transaction messages → 保存を確定**, distinct from online video publication (公開). This applies to import/project publication failures; the messages retain recovery paths, preserved-file guarantees, and retry instructions.

## Context checks and ambiguity resolution

- Inspected `AssetInspector.tsx`: `assetSelection` is the selected asset panel, so it is 選択中の素材, not a selection command.
- Inspected `ClipCreation.tsx`: `clipDuration` receives a formatted elapsed duration, not a start timestamp. It is 選択範囲の長さ：{{duration}}.
- Inspected `PublishReview.tsx`: `launchEditReview` unlocks the upload review fields. It is アップロード内容を編集, not editing a written review.
- Inspected `ModelPicker.tsx`: all eight reasoning capabilities map separately; `max` and `ultra` are not merged.
- Inspected `LaunchRow.tsx`: dynamic platform/video names stay untouched in interpolation; surrounding status and URL labels are Japanese.
- Inspected `asset-references.ts`: `storageReferenceCheckFailed` concerns references contained in the named source file, not an asset located at that path.
- Inspected storage/brand-recovery, finished-file preservation, and chapter-validation consumers for recovery and restriction wording. `appManualChaptersUnsupported` explicitly says the feature is available only for the main YouTube video.
- Platform names, product/tool names, command and executable names (`npm run dev`, `codex login`, `VANDASHI_CODEX_PATH`, `codex.exe`), plugin identifiers, filename example `the-hidden-city`, version numbers, and aspect ratios remain intact.
- All language autonyms (including English) are unchanged. Markdown emphasis and all interpolation token names are preserved. Japanese singular/plural count variants intentionally use identical wording while retaining every `_one` and `_other` key.

## Validation

Parsed every output as a flat JSON string dictionary and compared it with the matching English namespace. All keys match, with no missing/extra keys or empty values. Interpolation token multisets and Markdown emphasis-marker counts match for every entry. Untranslated-equal values are limited to names/autonyms, aspect ratios, and the punctuation-only `launchPlatformItem` template; no English placeholder translations remain.

Reviewed the entire translated catalog for terminology, actionable failure/recovery meaning, Japanese punctuation, and consistency between tabs and errors. No unresolved semantic ambiguities. GUI wrapping and final integration checks belong to the integrating root task and were not run by this translation worker.
