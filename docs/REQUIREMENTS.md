# Vandashi acceptance checklist

Source of truth: [`genesis_prompt.md`](../genesis_prompt.md), read in full through line 714 on 2026-09-23. Source references below use `genesis_prompt.md:Lx–Ly`. Re-read the relevant source section before each implementation or review. This checklist records the entire requested product; milestones sequence work and do not remove scope.

Unchecked means **not yet verified**, including work that may already exist. Check an item only with a corresponding implementation and current test or manual verification evidence. Record evidence in the verification log; do not equate scaffolding, a disabled button, or a mock adapter with a working integration. Ambiguities and chosen interpretations live in [`DECISIONS.md`](DECISIONS.md).

## 1. Product and local data model

Source: `genesis_prompt.md:L1–L105`.

- [ ] CORE-01 — App is named **Vandashi**, supports AI-driven video creation/editing and faceless channel workflows, and is open source.
- [ ] CORE-02 — Desktop app uses TypeScript, React, and Electron; production app requires no Vandashi server. User project content stays in local files.
- [ ] CORE-03 — Codex CLI is the initial and only required AI provider, using its supported authentication/harness; no secret API-key requirement is introduced as a substitute.
- [ ] CORE-04 — First launch creates app-local configuration storage. At least one brand is required for work; return visits restore the last selected brand.
- [x] CORE-05 — User chooses where brand data is stored. Brand root contains `brand_identity/`, `shared_assets/`, and `videos/`.
- [ ] CORE-06 — `brand_identity/` is its own initialized Git repository containing `brand_config.yml`, a brand image, and all taste files.
- [x] CORE-07 — Each video is its own Git repository with `video_packaging.yml`, `script.md`, `thumbnails/`, video assets, and `clips/`.
- [ ] CORE-08 — Every clip has an independent Hyperframes project and Git history without accidentally adding a nested Git repository as an unusable gitlink in the parent.
- [ ] CORE-09 — Repositories and content are usable outside the app: markdown/YAML remain readable, named coherently, and editable manually.
- [ ] CORE-10 — Every AI edit is committed in every affected repository, including brand and video repositories when both change.
- [ ] CORE-11 — Chat exposes “Revert last change” with a back-arrow icon. Revert coordinates file state and the retained Codex conversation checkpoint; a missing checkpoint produces a clear toast rather than silently reverting only one side.

## 2. Architecture, engineering controls, and installation

Source: `genesis_prompt.md:L106–L148` and `L678–L714`.

- [ ] ENG-01 — Inspect cloned T3 Code source for Codex integration, model/effort discovery, chat composition, diff presentation, and visible progress before implementing equivalents. Record provenance and license obligations.
- [ ] ENG-02 — Inspect Codex CLI/app-server source or generated protocol for supported session resume, fork/rollback, authentication, rate limits, capabilities, and plugin discovery. Test the undo behavior against the real CLI.
- [ ] ENG-03 — Inspect cloned Hyperframes/Studio source for supported embedding, project format, assets, preview lifecycle, visual tokens, and upgrades.
- [ ] ENG-04 — Define modular architecture and import boundaries before feature implementation. Renderer, application logic, domain models, and OS/integration adapters have explicit contracts.
- [ ] ENG-05 — Local filesystem persistence sits behind replaceable interfaces so future server/GitHub sync does not require rewriting feature logic; no server or sync feature is required now.
- [ ] ENG-06 — Strict TypeScript and lint rules enforce the architecture, reject warnings, and reject user-visible string literals in UI files. English strings use translation keys from the first UI implementation.
- [ ] ENG-07 — Commit checks require passing static analysis and meaningful tests; repository CI enforces the same checks. Document that local hooks can be bypassed and use CI as the review gate.
- [ ] ENG-08 — `AGENTS.md` mandates architecture/lint compliance, no generic or text-heavy design, edge-case review, relevant documentation updates, and verified feature commits.
- [ ] ENG-09 — `AGENTS.md` requires checking every consumer of a shared component and testing affected pages after changes.
- [ ] ENG-10 — `AGENTS.md` requires updating itself when architecture changes, internal padding for horizontal scrollers, and a landing-page consistency review after structural app changes once the site exists.
- [ ] ENG-11 — Tests exercise state transitions, filesystem/Git failure cases, isolation, integration protocol behavior, and meaningful edge cases; tests do not merely repeat implementation constants.
- [ ] ENG-12 — Dependency handling covers Git, Codex CLI, Hyperframes, Hyperframes Studio, and the Hyperframes Codex plugin, plus dependencies discovered from their actual runtime requirements.
- [ ] ENG-13 — App works on macOS, Windows, and Linux. Packaging/build scripts and platform-specific path/process behavior are verified rather than assumed from macOS alone.
- [ ] ENG-14 — Electron has an enforced sensible native minimum window size near 1200px width and 16:9 proportions; resizing above the minimum preserves usable panes.
- [ ] ENG-15 — Privileged file/process operations are confined to validated main-process APIs; the renderer and embedded Studio do not receive unrestricted Node access.

## 3. Brand selection and brand workspace

Source: `genesis_prompt.md:L149–L262`.

- [ ] BRAND-01 — Brand list is ordered by most recently accessed. Empty state has a concise create action.
- [ ] BRAND-02 — Create flow asks for parent folder, then one name field in a dialog with a concise brand explanation/example. Canceling either step leaves no partial brand.
- [ ] BRAND-03 — Name is never shorter than three characters; filesystem-safe directory naming handles collisions and platform restrictions without losing the displayed brand name.
- [ ] BRAND-04 — Successful creation initializes real data and Git history and enters the brand page.
- [ ] BRAND-05 — Brand page has **Brand**, **Videos**, and **Shared assets** tabs in the same tab style as the video workspace.
- [ ] BRAND-06 — Brand tab places chat left and attributes right; divider is visibly draggable on hover, persists its width, and respects 25% minimum pane widths.
- [ ] BRAND-07 — Attributes section edits brand title, theme/description, and brand image; its shared chat CTA sits next to the section heading, not on each field.
- [ ] BRAND-08 — Long-form channel fields include YouTube, Odysee, and Rumble; short-form fields include TikTok, Instagram, Facebook Reels, and X. Each has URL and optional logged-in browser.
- [ ] BRAND-09 — All attributes persist to `brand_config.yml`; initial title equals the creation name.
- [ ] BRAND-10 — Taste-guide chips have distinct icons; configuration fields and guide editing are visibly separate sections.
- [x] BRAND-11 — Provide separate guides for long/short titles, descriptions, tags, scripts, and editing; plus thumbnail design, visual identity, and YouTube chapters. This is **13 guides** in total, combining the early global list and later UI list.
- [ ] BRAND-12 — Guide filenames are descriptive and end in `_TASTE.md`; corresponding guide selection opens the correct document.
- [ ] BRAND-13 — Guide editor supports manual edits, save, Ctrl/Cmd+Z, font increase/decrease buttons, and keyboard shortcuts.
- [x] BRAND-14 — Every guide has a useful deterministic initial text. All defaults are exported static strings in one discoverable file so Igor can edit them easily.
- [ ] BRAND-15 — A dedicated specialist studies current guidance/skills and authors the defaults with the complete genesis context; research provenance is retained. Defaults are not generated during brand creation.
- [ ] BRAND-16 — Dirty manual changes enable Save and block AI work. Saving requests an AI commit title/body, shows an editable confirmation, and rejects empty title/body.
- [ ] BRAND-17 — If commit-text generation fails, confirmation still opens with empty editable fields. Successful save commits files and disables Save until a further edit.
- [ ] BRAND-18 — Entering a brand validates AI availability and repository cleanliness with recovery fallbacks before enabling work. Video-only Hyperframes checks are deferred to the video pre-page.
- [ ] BRAND-19 — Videos tab lists thumbnail when present, identification/title according to the documented decision, and a two-line theme description with an expansion action. Data is read from the packaging schema.
- [ ] BRAND-20 — Existing video card opens that workspace via validation; create action starts new-video validation/onboarding.
- [ ] BRAND-21 — Shared assets reuse the complete asset feature and interactions with a shared-folder scope, avoiding duplicated feature logic.

## 4. Chat, Codex sessions, and change consistency

Source: `genesis_prompt.md:L100–L121`, `L241–L247`, `L263–L367`.

- [ ] CHAT-01 — Same polished chat component serves brand, video, asset, clip, recovery, and publishing contexts; composer and diff interactions follow inspected T3 behavior.
- [ ] CHAT-02 — Each logical scope has a durable Codex conversation association. Reopening a scope resumes the same conversation, including after application restart.
- [ ] CHAT-03 — Open conversation tabs are horizontally scrollable, most-recent-first, and show close on hover. Closing all tabs shows a centered concise empty state with an appropriate icon/illustration.
- [ ] CHAT-04 — Refresh/new-conversation action intentionally resets a scope's session; merely closing/reopening a tab does not erase its history.
- [ ] CHAT-05 — Every editable form/section has a consistent AI action icon and scope-specific chat. Brand attributes share one chat; each taste document and each packaging attribute have separate chats.
- [ ] CHAT-06 — Read/edit mode selector is enforced by the Codex runtime, not only a prompt. In read mode, change requests instruct the user to switch mode. Edit mode still answers questions without gratuitous edits.
- [ ] CHAT-07 — Model list, valid reasoning efforts, and speed/fast-mode options derive from live supported capabilities. Unsupported combinations cannot be selected or sent.
- [ ] CHAT-08 — Last chosen chat model/effort is remembered; requested Astra 6/medium default is resolved against actual available model IDs with an explicit fallback if unavailable.
- [ ] CHAT-09 — Only one AI operation runs anywhere in the app at a time, including background commit generation, metadata work, repair, and upload supervision.
- [ ] CHAT-10 — Active AI operation locks conflicting editors and global workspace navigation with obvious disabled/loading feedback. Stop/error handling releases the lock after cleanup.
- [ ] CHAT-11 — Pending manual edits block new AI work across conflicting scopes. Saving/discarding restores availability. Staged script handoff is the sole explicit controlled exception.
- [ ] CHAT-12 — Render assistant/user messages, available reasoning summaries/progress, tool activity, errors, and final changed-file summaries live. Each changed file expands to its scrollable diff.
- [ ] CHAT-13 — `@` opens a filtered file picker with scope-appropriate items, file-type icons, distinct guide/config/logo treatments, and rich inline mentions.
- [ ] CHAT-14 — Mentions are delivered to Codex as supported file references to the correct local paths; spaces, Unicode, duplicate basenames, deleted files, and paths outside the current scope behave predictably.
- [ ] CHAT-15 — File picker and drag/drop attachments work in every chat. Video attachments default to local video assets; shared use occurs only when explicitly requested or subsequently approved.
- [ ] CHAT-16 — If a previously recorded Codex session was deleted, start a new one and toast that history was unavailable. First-ever scope use never displays a false recovery error.
- [ ] CHAT-17 — Every user message receives fresh contextual instructions, not just the first turn. User text is clearly separated from app guidance.
- [ ] CHAT-18 — Each contextual prompt identifies the role, main editable file/scope, explicit mandatory reads, optional files with short explanations, allowed cross-file work, read/edit restrictions, relevant Git history, and commit obligations.
- [ ] CHAT-19 — Brand-config chat mandatorily reads `brand_config.yml`, knows its logo, all taste guides, and shared assets. Taste-guide chats mandatorily read their own guide and brand config, and know related guides/global assets.
- [ ] CHAT-20 — Long/short guide chats explicitly identify the active format and prohibit modifying the opposite-format guide unless the user requests it.
- [ ] CHAT-21 — Video prompts distinguish brand/shared assets from local assets, include brand logo context, and require asset title/description/tags before use. Explicit shared-asset requests proceed directly.
- [ ] CHAT-22 — Prompts permit relevant Git-history inspection, avoid unrelated changes on questions, and require concise informative commits for all changed repositories.
- [ ] CHAT-23 — On AI completion, inspect every affected/allowed repository. If dirty, use the configured inexpensive commit-only AI operation; it cannot edit project content.
- [ ] CHAT-24 — If that operation fails or leaves changes, deterministic commit fallback uses meaningful affected-file information. Verify cleanliness afterward and surface errors if Git commit fails.
- [ ] CHAT-25 — Apply the same commit-recovery sequence on brand entry and video entry, with blocking progress. Crash/interruption recovery preserves available conversation history and current file state.
- [ ] CHAT-26 — Undo captures all affected repository checkpoints and the supported conversation boundary. Test commits made by AI itself, multiple repositories, no-file-change turns, unavailable histories, interrupted runs, and rollback failure.

## 5. Video validation, onboarding, and workspace shell

Source: `genesis_prompt.md:L368–L435`.

- [ ] VIDEO-01 — Workspace tabs are Packaging, Creation workspace, Manual video editing, Asset creation, Clips creation, and Launch Suite; open and test every tab individually.
- [ ] VIDEO-02 — Clips and Launch Suite are disabled until the required video output exists. Vertical projects do not show Clips.
- [ ] VIDEO-03 — Before workspace entry, validation shows completed/total percentage and the current dependency/task label, with deterministic progress rather than an arbitrary animation.
- [ ] VIDEO-04 — Validate Codex installation, actual executable operation, authentication, and available access/limits using supported APIs where possible; do not infer a successful AI turn from executable presence alone.
- [ ] VIDEO-05 — Validate Git, Hyperframes runtime, Studio, Codex Hyperframes plugin, project format, and actual extra runtime dependencies discovered during integration.
- [ ] VIDEO-06 — Missing dependency stops entry at an actionable error with Retry. Failed retry shows a toast and keeps the problem visible; successful retry continues and closes repair chat.
- [ ] VIDEO-07 — AI-repairable problems offer a left-side repair chat with prepared editable instructions; the user sends them explicitly. Chat does not initially occupy the page.
- [ ] VIDEO-08 — Missing/unavailable Codex, login, or quota access gets an appropriate official setup/login/account action rather than an impossible AI repair button.
- [ ] VIDEO-09 — Validate cleanliness of brand plus video repositories with commit fallback; failure to commit visibly prevents inconsistent entry.
- [ ] VIDEO-10 — Validate packaging schema and recover malformed packaging from the latest compatible Git revision, with a preserved copy of invalid user content and clear recovery feedback.
- [ ] VIDEO-11 — Ensure all shared assets are available to the video/Hyperframes project and mentions on every entry, including assets added after the video was created.
- [ ] VIDEO-12 — New-video onboarding offers only 16:9 horizontal and 9:16 vertical, with genuine relevant platform icons, and a required identification name distinct from release title.
- [ ] VIDEO-13 — Identification input safely becomes a folder name, including reserved Windows names, traversal, separators, collisions, whitespace, and Unicode handling.
- [ ] VIDEO-14 — Successful onboarding initializes the real project and first Git commit before entering Packaging; a failed create can be retried without orphan projects.

## 6. Packaging

Source: `genesis_prompt.md:L436–L457`.

- [ ] PACK-01 — Two panes: context chat left and editable packaging right; there is no duplicated brand-guide editor.
- [ ] PACK-02 — Typed/validated `video_packaging.yml` stores long/short title candidate lists, long/short descriptions, long/short tag lists, video identification/theme, and thumbnail ordering.
- [ ] PACK-03 — Multiple title candidates support the intended A/B workflow; no unsupported publishing capability is falsely advertised.
- [ ] PACK-04 — Thumbnail folder supports manual image upload, AI creation, meaningful descriptive filenames, rename when contents change, reordering, and any number of candidates.
- [ ] PACK-05 — First thumbnail is the main one; launch selects only the supported number of leading candidates for the platform.
- [ ] PACK-06 — Manual packaging/thumbnail-order edits follow editable commit confirmation and remain in draft until save. AI and manual editing lock one another consistently.
- [ ] PACK-07 — Each attribute's AI chat reads `video_packaging.yml` and the matching taste guide; thumbnail chat focuses on `thumbnails/` and knows packaging order, thumbnail taste, visual identity, and brand context.
- [ ] PACK-08 — Packaging prompts know brand identity and allow user-requested updates to taste guides with commits in every affected repository.
- [ ] PACK-09 — External YAML changes are validated before entry, with deterministic latest-valid-version recovery and verification of the recovered schema.

## 7. Creation workspace and script-driven editing

Source: `genesis_prompt.md:L458–L522`.

- [ ] CREATE-01 — Left pane switches between Script and AI chat; right pane shows current video preview and commit history.
- [ ] CREATE-02 — Preview updates after AI operations and manual Studio saves, without stale output after switching tabs.
- [ ] CREATE-03 — Commit list pages by 12; Next appears only when further commits exist. New commits refresh the list and return it to the first page.
- [ ] CREATE-04 — Commit card shows title, two-line expandable description, copy-SHA action, and changed-file rows with additions/deletions and expandable scrollable diffs.
- [ ] CREATE-05 — Script starts from `script.md`; manual typing stays in application memory until the confirmed handoff.
- [ ] CREATE-06 — Editor has reset-to-file, Undo, Redo, Diff, and Save. Disabled states reflect actual draft/file equality and undo/redo availability.
- [ ] CREATE-07 — Reset itself is undoable. Keyboard undo/redo and font controls behave consistently with the markdown editing pattern.
- [ ] CREATE-08 — Dirty script disables AI-chat selection until reset or confirmed save. Diff dialog accurately compares draft with disk, including Unicode and line-ending cases.
- [ ] CREATE-09 — Save dialog shows the actual diff, optional user guidance, and available model/effort selectors; cancel keeps the draft intact.
- [ ] CREATE-10 — Confirm atomically writes and stages `script.md` without committing, switches to chat, and starts the synchronization turn with the chosen model/effort and optional guidance.
- [ ] CREATE-11 — During synchronization, script/global navigation are blocked and live progress is visible; completion refreshes preview/history and shows a completion toast only after verification/commit cleanup.
- [ ] CREATE-12 — Script-handoff prompt requires reading the staged diff against the previous committed script, active-format edit guide, actual Hyperframes skill, and relevant asset metadata, then synchronizing the video.
- [ ] CREATE-13 — Direct creation-chat prompt also synchronizes every video change back into script, preserves its existing structural style, and mandatorily reads the active-format script and edit guides.
- [ ] CREATE-14 — Every used asset appears in script using the same path/mention representation as a user mention, including visual and audio assets.
- [ ] CREATE-15 — All video assets are searchable mention candidates; attached files enter the local asset flow.
- [ ] CREATE-16 — Only an empty script first authored through chat receives researched initial Hyperframes script-structure guidance. Manual-first edits and nonempty scripts do not receive inappropriate boilerplate.
- [ ] CREATE-17 — Failed or interrupted synchronization keeps the user's script recoverable, identifies unfinished video work, performs required commit recovery, and resumes the same available chat.

## 8. Embedded manual editor

Source: `genesis_prompt.md:L523–L533`.

- [ ] STUDIO-01 — Embed actual Hyperframes Studio, with current project/preview and shared assets; do not substitute a screenshot or unrelated custom editor.
- [ ] STUDIO-02 — Entering Studio reflects current AI changes. Studio startup, shutdown, port allocation, crash, and stale-process recovery are managed by the app.
- [ ] STUDIO-03 — Pinned upstream integration has an upgrade guide or local skill describing version update and compatibility verification.
- [ ] STUDIO-04 — Leaving Studio checks actual Git changes. Clean projects navigate without a dialog; dirty projects offer Save, Discard, and the ability to remain editing.
- [ ] STUDIO-05 — Save shows commit-generation progress, editable title/body confirmation, and expandable actual file diffs.
- [ ] STUDIO-06 — Before completing manual save, a configured inexpensive/high-effort AI operation updates `script.md` to accurately reflect manual changes with a specific synchronization prompt.
- [ ] STUDIO-07 — Save commits synchronized changes and refreshes all preview/history state; discard restores the captured manual-edit baseline and does not remove unrelated user files.
- [ ] STUDIO-08 — Commit-generation/synchronization failure is visible and recoverable; do not claim a synchronized script when AI reconciliation failed.

## 9. Assets and metadata

Source: `genesis_prompt.md:L176–L179`, `L351–L360`, `L424`, `L534–L553`.

- [ ] ASSET-01 — Identical reusable asset page serves shared and local folders: chat left, asset grid middle, selected-asset inspector right; inspector has an intentional empty state.
- [ ] ASSET-02 — Video asset storage is the actual Hyperframes asset directory through the documented path mapping; assets are ready for rendering without redundant import copies.
- [ ] ASSET-03 — Type filters include image, audio, video, all enabled by default; GIF previews are supported.
- [ ] ASSET-04 — Add via filesystem picker and drag/drop. Detect already-present content before import, including different names for the same bytes.
- [ ] ASSET-05 — Import opens loading then editable proposed title, description, and tags generated by the configured inexpensive AI. AI sees existing tags and may suggest new ones.
- [ ] ASSET-06 — User confirms metadata before copying into project; cancel leaves the original untouched and no half-imported asset. AI failure permits a clear manual metadata fallback.
- [ ] ASSET-07 — Persist title/description/tags in supported embedded media metadata, with lossless sidecar fallback where needed. Metadata remains accessible to AI, index, and external tools; never silently transcode or corrupt source media.
- [ ] ASSET-08 — Recursively map assets and metadata on entry; build tag filters from actual contents, including nested folders.
- [ ] ASSET-09 — Normal browsing preserves folder navigation. Search spans titles and descriptions and presents matching results across folders; filtering/search uses a premapped index.
- [ ] ASSET-10 — Index refreshes after AI, manual, external, and shared-asset changes without requiring application restart.
- [ ] ASSET-11 — Folder chat can create/import/delete assets and knows brand config plus visual-identity guide; its changes are committed.
- [ ] ASSET-12 — Selecting image shows preview and copy-to-clipboard; video has playback; audio has playback and waveform; animated images remain animated.
- [ ] ASSET-13 — Inspector displays editable title/description/tags with standard save/commit and dirty-lock behavior.
- [ ] ASSET-14 — Asset-specific AI action opens/resumes a clearly named selected-asset scope, distinct from general folder chat.
- [ ] ASSET-15 — Local/shared distinction survives import, delete, edits, resynchronization, and clip references; no existing local asset is overwritten by a same-named shared file.
- [ ] ASSET-16 — Deletion and rename handle script/project references and unavailable files coherently; destructive loss does not occur silently.

## 10. Clips

Source: `genesis_prompt.md:L554–L578`.

- [ ] CLIP-01 — Clips are available only for horizontal parent projects with usable video output.
- [ ] CLIP-02 — Clip list selects a preview on the right and opens its editor through inner tab navigation.
- [ ] CLIP-03 — New-clip onboarding occupies the full tab, validates prerequisites, and requires a title plus 9:16 or 1:1 aspect ratio.
- [ ] CLIP-04 — Onboarding lays out title/ratio left and parent preview right, with start/end range controls and initial guidance beneath the timeline.
- [ ] CLIP-05 — Playback previews only the chosen range; selected-ratio overlay is a visual guide. Validate start < end, boundaries within duration, and usable duration.
- [ ] CLIP-06 — Confirm creates the clip's real repository/project and starts generation. App is locked while live progress is shown.
- [ ] CLIP-07 — First-clip prompt is distinct from iterative edits, includes range/ratio/guidance, parent project/assets, short-form editing taste, and permission to create needed assets.
- [ ] CLIP-08 — Iterative clip prompt knows both repositories but edits only the clip unless parent edits are explicitly requested.
- [ ] CLIP-09 — Successful creation enters clip workspace with the exact generation conversation resumed.
- [ ] CLIP-10 — Clip workspace has chat left, packaging middle, and current ratio-correct preview right. Packaging uses the same title/description/tag/thumbnail behavior where relevant.
- [ ] CLIP-11 — Packaging AI scopes can be opened/closed while retaining the default clip-edit conversation and history.
- [ ] CLIP-12 — Clip can be generated through natural-language cut instructions and supports requested new animations; it remains independently editable without breaking its parent.

## 11. Launch Suite and publication

Source: `genesis_prompt.md:L579–L605`.

- [ ] LAUNCH-01 — Video-local launch YAML records per-platform and per-selected-video/clip status plus published URL; survives app restart and AI/manual updates.
- [ ] LAUNCH-02 — Show distinct YouTube and YouTube Shorts identities, genuine platform icons, and long-form-right/short-form-left grouping with sensible vertical-project visibility.
- [ ] LAUNCH-03 — Each destination shows not posted/uploading/posted state; user can edit status and URL. Post action is available for eligible unpublished media.
- [ ] LAUNCH-04 — Destination selection opens an inner-tab review page populated from packaging; temporary per-release changes remain in memory until the release flow saves its manifest.
- [ ] LAUNCH-05 — Release review has no chat pane, supports manual metadata edits, and requires the logged-in browser if not configured at brand level.
- [ ] LAUNCH-06 — YouTube review offers AI chapter generation using complete video/script context and the YouTube-sections taste guide, with loading feedback.
- [ ] LAUNCH-07 — Chapter results are inspectable/editable in a dedicated dialog with full video preview and timestamp controls; invalid, unordered, or out-of-duration points are rejected.
- [ ] LAUNCH-08 — Final publish action opens a prepared but unsent editable user message; the user explicitly sends it. App guidance remains separate and cannot be replaced by editing the visible message.
- [ ] LAUNCH-09 — Publish prompt requires brand config, correct destination URL, requested browser, desired account identity, selected media, final packaging/chapters, and launch-manifest path.
- [ ] LAUNCH-10 — Actual browser capability is available to the Codex process. It checks login and destination identity before upload; wrong account blocks posting unless it can select and verify the requested account.
- [ ] LAUNCH-11 — Missing login requests user login in the browser and resumes after it. Passwords/tokens are not written into chat logs or project manifests.
- [ ] LAUNCH-12 — Real upload work updates YAML to uploading, monitors actual progress with bounded waits until success/error, then stores verified URL and posted state.
- [ ] LAUNCH-13 — App remains locked during upload supervision and releases on completion/failure; cancellation/interruption has a recoverable status rather than a false posted result.
- [ ] LAUNCH-14 — Long-form destinations choose parent video automatically. Short-form destinations offer available clips; vertical source projects can publish their own video.
- [ ] LAUNCH-15 — With no suitable clips/media, offer choosing a local video and navigating to clip creation where applicable. Imported publishing-only media proceeds through the same review/upload flow.
- [ ] LAUNCH-16 — Platform differences (supported title/thumbnail candidates, media formats, tags, descriptions, chapters) are handled by explicit adapters/capability checks rather than pretending all destinations behave identically.

## 12. Design, localization, settings, and desktop behavior

Source: `genesis_prompt.md:L606–L650`, `L671–L676`, `L711–L712`.

- [ ] UX-01 — App visually follows inspected Hyperframes Studio tokens; chat follows T3; the embedded editor feels part of the same application.
- [ ] UX-02 — Provide a distinct application icon, installed application/window identity, and appropriate platform icon resources.
- [ ] UX-03 — Keep copy concise: meaningful titles and info-icon tooltips rather than gratuitous subtitles or filler text.
- [ ] UX-04 — Tooltips may use selective bold/emphasis and accessible rich help, with scrolling/images only when useful; no broken media or unreadable decorative text.
- [ ] UX-05 — Horizontal scrollables reach the component edges and keep padding inside the scrolling content, not around the scroll viewport.
- [ ] UX-06 — Desktop panes remain usable at the native minimum, common sizes, and large windows; focus, keyboard access, dialog dismissal, loading, empty, error, and disabled states are checked.
- [ ] I18N-01 — English keyed-string architecture is in place immediately; actual translations start only after app functionality is finished.
- [ ] I18N-02 — App and later landing page support English, Japanese, French, Spanish, German, Korean, Brazilian Portuguese, and Italian; unsupported locales fall back to English.
- [ ] I18N-03 — Japanese uses natural kanji/kana; Korean uses Hangul. Translation review includes actual UI context, glyph coverage, wrapping, interpolations, and pluralization.
- [ ] I18N-04 — Hyperframes Studio may remain in its upstream language; the surrounding shell and app-owned help are translated.
- [ ] SET-01 — Fixed top-right settings icon is available on brand selection and brand page.
- [ ] SET-02 — Settings change app language and automatic-operation model/reasoning preferences individually, including commit text, metadata, chapter generation, and manual-edit script synchronization.
- [ ] SET-03 — Automatic operations default to available Luna-class/medium reasoning except justified high-effort tasks; settings persist and cannot select unsupported capabilities.
- [ ] SET-04 — Chat preferences are separate from automatic-operation settings and preserve the last selected model/effort.

## 13. Landing site, documentation, delivery, and final review

Source: `genesis_prompt.md:L652–L670` and `L678–L714`.

- [ ] SITE-01 — Build the landing site only after the app is complete, then host it on GitHub Pages under the repository/account URL without requiring a custom domain.
- [ ] SITE-02 — Landing highlights open source and free Vandashi software, accurately explains supported Codex/ChatGPT access requirements, and links the source.
- [ ] SITE-03 — Use strong web-design guidance/research, concise useful copy, and a distinctive design; app screenshots are accurate if used.
- [ ] SITE-04 — Verify mobile/desktop and intermediate viewport responsiveness with real browser use and no clipped controls/content.
- [ ] SITE-05 — Detect browser language, support all requested locales, and fall back to English; language can be deliberately selected where provided.
- [ ] DOC-01 — Human-readable GitHub README explains what the app does, setup, usage, prerequisites, and current integration limitations accurately.
- [ ] DOC-02 — README includes real app screenshots, landing URL after deployment, and a copy/paste prompt for an agent to clone, install, run, and open the app.
- [ ] DOC-03 — Maintain architecture/integration/upgrading guidance and records of material decisions. Re-read genesis for every feature and after context compaction.
- [ ] QA-01 — Before each meaningful commit, evaluate UX simplicity, edge cases, all lint rules, documentation updates, and no warnings/errors; run relevant tests.
- [ ] QA-02 — Manually test every screen, tab, shared-component use, and real external integration with computer use. Record exactly what was and was not exercised.
- [ ] QA-03 — After implementation, assign read-only independent reviews for each genesis section using the requested highest-capability model/highest reasoning; reviewers receive the full genesis context.
- [ ] QA-04 — Fix findings, request repeat review from the same section reviewer, and continue until each section has positive evidence-backed acceptance. Then retest the affected feature in the real app.
- [ ] QA-05 — Zero static-analysis errors/warnings and all required checks pass on the final state; complete feature/module commits and push the resulting repository to GitHub.
- [ ] QA-06 — Deployment/build/push success is verified from actual results; report environmental blockers and unverified platform/account behavior without claiming completion.

## Explicit scope boundaries from the source

The current genesis prompt does **not** request voice input, narration/TTS, voice cloning, speech recognition, or a standalone terminal pane. Audio assets and waveforms are requested (ASSET-12). Codex, Git, Hyperframes CLI/runtime, installation recovery, and process management are requested (ENG-12, VIDEO-04–08, STUDIO-02). Future user additions should be appended and traced here rather than inferred into the present scope.

## Delivery sequence without scope reduction

| Milestone                     | Includes                                                                                                    | Exit evidence                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| M0 — Contracts and references | Full requirements, source/license research, integration spikes, architecture, lint, English string scaffold | Actual protocol/Studio findings, strict checks, adapter contracts             |
| M1 — Local workspace          | Electron shell, storage schemas, Git, brands, defaults, settings, onboarding                                | Real files/repositories, persistence and recovery tests, brand UI walkthrough |
| M2 — AI and history           | Codex sessions/capabilities, all chat behaviors, operation lock, prompts, commits, coordinated undo         | Real Codex round trip/resume and rollback tests plus dirty-tree cases         |
| M3 — Packaging and assets     | All packaging, shared/local assets, metadata, search, mentions                                              | Actual imports and metadata round trips, cross-page asset verification        |
| M4 — Production workspace     | Hyperframes project generation/preview, script workflow, history/diffs, Studio embedding/reconciliation     | Real generated video and manual-to-AI/script round trip                       |
| M5 — Clips                    | New clip flow, trim preview, independent project, packaging, conversation continuity                        | Real clip generation and independent editing                                  |
| M6 — Release                  | Chapters, destination review, manifests, actual browser upload integration, monitoring                      | Verified supported test-account publication or documented account block       |
| M7 — App verification         | Cross-platform builds, failure recovery, every UI/tab, independent section review loop                      | Evidence for each completed checklist item; no unreported missing scope       |
| M8 — Translation              | All seven requested translations and context/layout review                                                  | Complete key coverage and language UI verification                            |
| M9 — Site and delivery        | Landing, screenshots, README, Pages, final audits, commits/push                                             | Live site and repository/build verification                                   |

## Verification log convention

For each completed item, record: requirement ID; implementation path(s); automated command/test and result; manual scenario and result; tested platform; date; known limitation. Integration fixtures are useful but do not alone satisfy a real integration requirement. Required external credentials/accounts or unavailable operating systems must be explicitly recorded as pending verification, not checked off.

### Verification recorded 2026-09-23

| IDs                                                | Evidence and current status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE-05                                            | Verified through actual Electron IPC with a native-picker result: `tests/e2e/desktop.spec.ts` creates a brand beneath the chosen temporary parent. `ProjectStore.createBrand` creates all three required directories. Picker is mocked only to provide a deterministic user selection; filesystem, IPC validation, and backend are real. macOS.                                                                                                                                                                                         |
| CORE-07                                            | Verified by `tests/storage.test.ts` with real Git repositories and filesystem data. Independent clip histories do not dirty the parent or create gitlinks. This checks project storage, not all video rendering behavior.                                                                                                                                                                                                                                                                                                               |
| BRAND-11, BRAND-14                                 | `src/domain/templates.ts` has 13 individually authored deterministic guides. `tests/storage.test.ts` verifies the complete inventory is instantiated. Current official YouTube/TikTok sources are recorded alongside defaults. Final independent editorial review remains covered by QA-03/04.                                                                                                                                                                                                                                          |
| ENG-15, VIDEO-13 (partial)                         | Desktop tests verify strict method/schema boundaries, exact main-frame location, source-file selection grants, symlink containment, native minimum size, and private Studio bridge targeting. Native Electron tests verify both declining and accepting the unsaved-work close dialog, including process exit. Windows/Linux packaging, distribution signatures, and adversarial third-party renderer review remain open.                                                                                                               |
| CORE-11, CHAT-26 (storage portion)                 | `tests/git.test.ts` verifies real Git checkpoint restoration with backup reference, restoration commit, compensation-ready clean state, and exact staged-script rollback preserving unrelated work. Codex conversation/file coordination is a separate integration requirement and remains unchecked here.                                                                                                                                                                                                                              |
| VIDEO-10, PACK-09                                  | `tests/storage.test.ts` corrupts packaging YAML, recovers its latest valid committed data, and checks the retained invalid-file backup. The typed recovery listener fires exactly once with the file, backup, and revision. Desktop emits the recovery notice with filename and backup location; its message variants are tested. Application workspace refreshes are serialized with the operation gate, or use the last stable snapshot while edits run. Native recovery-toast walkthrough remains part of final manual acceptance.   |
| ASSET-04, ASSET-07–10, ASSET-15 (backend portions) | `tests/storage-assets.test.ts` verifies original-byte SHA-256 dedup, PNG XMP and MP3 ID3 round trips, audio byte preservation, external embedded metadata indexing, nested sidecars, local/shared filename isolation, and shared-copy conflict protection. Actual desktop import and image decode pass in `tests/e2e/desktop.spec.ts`. Unsupported containers use explicit sidecar fallback; full media-format matrix and every asset UI action remain open.                                                                            |
| SET-02/03 (persistence portion)                    | Desktop and storage schemas now agree on pane percentages 25–75, with valid/invalid settings tests. Full operation-specific model preferences and all locales remain open.                                                                                                                                                                                                                                                                                                                                                              |
| CORE-06, BRAND-07/09 (image storage)               | `tests/storage-assets.test.ts` verifies selected image copying, original-byte preservation, portable YAML reference, tracked image/metadata commit, and rejection of escaping relative image paths. Native media tests verify the selected original can be previewed without granting arbitrary external paths.                                                                                                                                                                                                                         |
| CREATE-02 (export freshness)                       | Git/source tests prove packaging/launch bookkeeping does not invalidate an export, but uncommitted or committed source changes do. `renderedRevision` is compared to the actual indexed source; dirty relevant source files also invalidate the advertised output. Old MP4 bytes remain recoverable. Native preview-after-AI/manual-edit behavior is verified separately by the media workstream.                                                                                                                                       |
| ASSET-05/06, ASSET-09/13 (renderer workflow)       | `tests/e2e/assets.spec.ts` uses the actual Electron renderer with deterministic AI fixture responses: failed automatic description permits reviewed manual metadata, nested description search finds the correct asset, type filters default checked, editing locks chat/navigation/refresh, and Save opens editable AI commit confirmation before updating the selection. Backend tests separately verify the exact custom commit title/body. Real AI image understanding and the complete supported-media preview matrix remain open. |
| ASSET-10/15/16 (refresh and safety)                | Asset entry, returning window focus, and an explicit refresh action reload the index, gated by dirty/import/mutation/busy state. Storage tests verify authoritative shared metadata propagation, same-name isolation, conflict protection, and old snapshot retention after library removal. Deletion scans nested text sources and `.hyperframes` files, decodes URL/HTML filename representations, and blocks with the referencing filenames; a meaningful test verifies files survive until references are removed.                  |

The current focused suite has **55 passing storage/Git/desktop/asset-index/waveform tests** on this macOS development environment. Three actual Electron shell/import/close tests and four asset-renderer interaction tests pass. The latest asset run also verifies the 1200×720 minimum window with a 75% chat pane: library and inspector stack without horizontal overflow. Native waveform coverage includes decoded playback and 100 rendered peak bars, while a separate actual desktop IPC test runs FFmpeg against the imported audio. The desktop tests use real IPC/storage except deterministic native picker/close choices; asset renderer tests replace backend AI responses and do not claim a real AI round trip. A real 115 MB audio fixture verifies the host waveform decoder and cache invalidation without loading the recording into the renderer. Unsupported embedded formats retain safe sidecar metadata. This is **partial product verification**, not a declaration that all requested workflows, platform publishing, translations, packaged operating systems, or the landing site are complete. Storage's author performed these implementation checks; the required independent final reviewer is still separate.
