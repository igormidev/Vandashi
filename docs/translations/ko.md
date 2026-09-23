# Korean desktop catalog review

Completed all 653 source entries from `/tmp/vandashi-translations/english.json`: 382 UI labels/help strings, 264 app-owned messages, and 7 native-dialog/filter strings. Output is limited to this Korean temporary directory; no repository files, user content, templates, generated provider text, or other locales were modified.

## Context and terminology

Read the complete original `genesis_prompt.md`, `AGENTS.md`, and the relevant acceptance/localization requirements. Reviewed source consumers where the source text was ambiguous, including `PublishReview.tsx`, `LaunchRow.tsx`, `ModelPicker.tsx`, `AssetPreview.tsx`, `ScriptEditor.tsx`, the finished-video staging guards, speech worker validation, and the asset metadata warning.

- Brand → **브랜드**: the creator's channel identity, including multiple platform accounts.
- Packaging → **게시 정보**: titles, descriptions, tags, and thumbnails; never physical packaging. Launch suite → **게시 관리** to distinguish the publishing workflow from its editable metadata.
- Assets → **에셋**; shared assets → **공유 에셋**; library → **라이브러리**. These cover images, audio, and video as reusable production material.
- Script → **대본**, consistently a narrative/production script rather than executable code.
- Clips → **클립**, independent excerpts with their own composition, packaging, and history. Source video → **원본 영상**; parent relationship diagnostics use **상위 영상**.
- Long/short form → **롱폼 / 숏폼**. Landscape/portrait/square → **가로 / 세로 / 정사각형**.
- Model effort → **추론 수준**; active thinking status → **추론 중**. Effort levels remain distinct: 없음, 최소, 낮음, 보통, 높음, 매우 높음, 최대, 최상.
- Read only → **읽기 전용**; allow edits → **편집 허용**. Help explicitly states that read-only conversations do not change files.
- Commit → **커밋**; version history → **버전 기록**; checkpoint → **복원 지점**. Turn recovery diagnostics use **대화 단계** because rollback covers both conversation state and files.
- Composition → **컴포지션**; render → **렌더링**. Finished imported media is explicitly distinguished from an editable composition.

## Ambiguities resolved

Storage-layer “publish” means completing the local atomic creation/import, so those errors use **생성/가져오기를 완료하지 못했습니다**, avoiding any suggestion that files were uploaded to a social platform. The staging replacement warning preserves its meaning: the new filesystem entry occupying the path was retained.

“Edit review” returns the prepared upload to its editable review form, rendered as **업로드 내용 수정**. “Titles” is **제목 후보** in its packaging/upload consumers, which accept multiple title candidates. “Speech features” refers to model input data, rendered as **음성 특징 데이터**, not a speech-related UI capability.

Unavailable previews are described as unavailable, without claiming that the file format is categorically unsupported. Recovery errors retain the source's distinction between files already preserved, work that will be preserved, and missing verified recovery points. The close confirmation explicitly says unsaved work will be discarded; its destructive button is **그래도 종료**.

## Language review

Used concise noun/verb labels for controls and polite **-하세요 / -습니다** sentences for instructions and errors. Kept Korean word order natural. Avoided choosing Korean subject/object particles based on unknown interpolated values by using neutral constructions such as `{{name}} 항목` and `{{model}} 모델` where appropriate. Korean count strings use the same wording for `_one` and `_other`, retaining both required keys.

Preserved every product/platform/tool name, all eight language autonyms (English plus seven target languages), aspect ratios, literal `the-hidden-city` example, `npm run dev`, `codex login`, `VANDASHI_CODEX_PATH`, `codex.exe`, and plugin identifiers. All interpolation tokens and Markdown emphasis markers match their source entries exactly.

## Verification and limits

Validated strict JSON parsing, duplicate-free and exact namespace keysets, nonempty string values, interpolation-token multisets, Markdown emphasis counts, and an explicit allowlist for identical source/target entries. Identical entries are only names/autonyms, fixed aspect ratios, and the interpolation-only platform/item separator.

This review covers translation semantics and source-component context. No GUI, build, integration test, font/glyph or layout verification was performed in this bounded subtask; those remain with the integrating agent.
