# Vandashi acceptance checklist

Source of truth: [`genesis_prompt.md`](../genesis_prompt.md), read in full again on 2026-09-23. Source references below use `genesis_prompt.md:Lx–Ly`. Re-read the relevant source section before each implementation or review. This checklist records the entire requested product; milestones sequence work and do not remove scope.

Unchecked means **not yet verified**, including work that may already exist. Check an item only with a corresponding implementation and current test or manual verification evidence. Record evidence in the verification log; do not equate scaffolding, a disabled button, or a mock adapter with a working integration. Ambiguities and chosen interpretations live in [`DECISIONS.md`](DECISIONS.md).

The checked items below are supported by the dated evidence anchors E01–E15, not a final
product sign-off. UI evidence is from macOS Electron; controlled AI/browser fixtures are
identified separately from real Codex/media execution. A combined requirement stays
unchecked when any clause lacks evidence. Historical package tests establish the tested
integration only: **the final release installer, Windows/Linux execution, real external uploads,
landing deployment, and final independent reviews remain unaccepted**.

## 1. Product and local data model

Source: `genesis_prompt.md:L1–L105`.

- [x] CORE-01 — App is named **Vandashi**, supports AI-driven video creation/editing and faceless channel workflows, and is open source. [E01](#e01).
- [x] CORE-02 — Desktop app uses TypeScript, React, and Electron; production app requires no Vandashi server. User project content stays in local files. [E01](#e01).
- [x] CORE-03 — Codex CLI is the initial and only required AI provider, using its supported authentication/harness; no secret API-key requirement is introduced as a substitute. [E01](#e01).
- [x] CORE-04 — First launch creates app-local configuration storage. At least one brand is required for work; return visits restore the last selected brand. [E01](#e01).
- [x] CORE-05 — User chooses where brand data is stored. Brand root contains `brand_identity/`, `shared_assets/`, and `videos/`. [E01](#e01).
- [x] CORE-06 — `brand_identity/` is its own initialized Git repository containing `brand_config.yml`, a user-selected brand image when configured, and all taste files. [E01](#e01).
- [x] CORE-07 — Each video is its own Git repository with `video_packaging.yml`, `script.md`, `thumbnails/`, video assets, and `clips/`. [E01](#e01).
- [x] CORE-08 — Every composition clip has an independent Hyperframes project and Git history without accidentally adding a nested Git repository as an unusable gitlink in the parent. Finished-media imports retain independent Git history and direct playback instead of pretending to have a composition. [E01](#e01).
- [x] CORE-09 — Repositories and content are usable outside the app: markdown/YAML remain readable, named coherently, and editable manually. [E01](#e01).
- [x] CORE-10 — Every AI edit is committed in every affected repository, including brand and video repositories when both change. [E05](#e05).
- [x] CORE-11 — Chat exposes “Revert last change” with a back-arrow icon. Revert coordinates file state and the retained Codex conversation checkpoint; a missing checkpoint produces a clear toast rather than silently reverting only one side. [E05](#e05).

## 2. Architecture, engineering controls, and installation

Source: `genesis_prompt.md:L106–L148` and `L678–L714`.

- [x] ENG-01 — Inspect cloned T3 Code source for Codex integration, model/effort discovery, chat composition, diff presentation, and visible progress before implementing equivalents. Record provenance and license obligations. [E02](#e02).
- [x] ENG-02 — Inspect Codex CLI/app-server source or generated protocol for supported session resume, fork/rollback, authentication, rate limits, capabilities, and plugin discovery. Test the undo behavior against the real CLI. [E02](#e02).
- [x] ENG-03 — Inspect cloned Hyperframes/Studio source for supported embedding, project format, assets, preview lifecycle, visual tokens, and upgrades. [E02](#e02).
- [x] ENG-04 — Define modular architecture and import boundaries before feature implementation. Renderer, application logic, domain models, and OS/integration adapters have explicit contracts. [E02](#e02).
- [x] ENG-05 — Local filesystem persistence sits behind replaceable interfaces so future server/GitHub sync does not require rewriting feature logic; no server or sync feature is required now. [E02](#e02).
- [x] ENG-06 — Strict TypeScript and lint rules enforce the architecture, reject warnings, and reject user-visible string literals in UI files. English strings use translation keys from the first UI implementation. [E02](#e02).
- [ ] ENG-07 — Commit checks require passing static analysis and meaningful tests; repository CI enforces the same checks. Document that local hooks can be bypassed and use CI as the review gate.
- [x] ENG-08 — `AGENTS.md` mandates architecture/lint compliance, no generic or text-heavy design, edge-case review, relevant documentation updates, and verified feature commits. [E02](#e02).
- [x] ENG-09 — `AGENTS.md` requires checking every consumer of a shared component and testing affected pages after changes. [E02](#e02).
- [x] ENG-10 — `AGENTS.md` requires updating itself when architecture changes, internal padding for horizontal scrollers, and a landing-page consistency review after structural app changes once the site exists. [E02](#e02).
- [x] ENG-11 — Tests exercise state transitions, filesystem/Git failure cases, isolation, integration protocol behavior, and meaningful edge cases; tests do not merely repeat implementation constants. [E02](#e02).
- [x] ENG-12 — Dependency handling covers Git, Codex CLI, Hyperframes, Hyperframes Studio, and the Hyperframes Codex plugin, plus dependencies discovered from their actual runtime requirements. [E02](#e02).
- [ ] ENG-13 — App works on macOS, Windows, and Linux. Packaging/build scripts and platform-specific path/process behavior are verified rather than assumed from macOS alone.
- [x] ENG-14 — Electron has an enforced sensible native minimum window size near 1200px width and 16:9 proportions; resizing above the minimum preserves usable panes. [E03](#e03).
- [x] ENG-15 — Privileged file/process operations are confined to validated main-process APIs; the renderer and embedded Studio do not receive unrestricted Node access. [E02](#e02).

## 3. Brand selection and brand workspace

Source: `genesis_prompt.md:L149–L262`.

- [x] BRAND-01 — Brand list is ordered by most recently accessed. Empty state has a concise create action. [E03](#e03).
- [x] BRAND-02 — Create flow asks for parent folder, then one name field in a dialog with a concise brand explanation/example. Canceling either step leaves no partial brand. [E03](#e03).
- [x] BRAND-03 — Name is never shorter than three characters; filesystem-safe directory naming handles collisions and platform restrictions without losing the displayed brand name. [E03](#e03).
- [x] BRAND-04 — Successful creation initializes real data and Git history and enters the brand page. [E03](#e03).
- [x] BRAND-05 — Brand page has **Brand**, **Videos**, and **Shared assets** tabs in the same tab style as the video workspace. [E03](#e03).
- [x] BRAND-06 — Brand tab places chat left and attributes right; divider is visibly draggable on hover, persists its width, and respects 25% minimum pane widths. [E03](#e03).
- [x] BRAND-07 — Attributes section edits brand title, theme/description, and brand image; its shared chat CTA sits next to the section heading, not on each field. [E03](#e03).
- [x] BRAND-08 — Long-form channel fields include YouTube, Odysee, and Rumble; short-form fields include TikTok, Instagram, Facebook Reels, and X. Each has URL and optional logged-in browser. [E03](#e03).
- [x] BRAND-09 — All attributes persist to `brand_config.yml`; initial title equals the creation name. [E03](#e03).
- [x] BRAND-10 — Taste-guide chips have distinct icons; configuration fields and guide editing are visibly separate sections. [E03](#e03).
- [x] BRAND-11 — Provide separate guides for long/short titles, descriptions, tags, scripts, and editing; plus thumbnail design, visual identity, and YouTube chapters. This is **13 guides** in total, combining the early global list and later UI list. [E03](#e03).
- [x] BRAND-12 — Guide filenames are descriptive and end in `_TASTE.md`; corresponding guide selection opens the correct document. [E03](#e03).
- [x] BRAND-13 — Guide editor supports manual edits, save, Ctrl/Cmd+Z, font increase/decrease buttons, and keyboard shortcuts. [E03](#e03); packaged keyboard follow-up in [MANUAL-VERIFICATION.md](MANUAL-VERIFICATION.md).
- [x] BRAND-14 — Every guide has a useful deterministic initial text. All defaults are exported static strings in one discoverable file so Igor can edit them easily. [E03](#e03).
- [x] BRAND-15 — A dedicated specialist studies current guidance/skills and authors the defaults with the complete genesis context; research provenance is retained. Defaults are not generated during brand creation. [E03](#e03).
- [x] BRAND-16 — Dirty manual changes enable Save and block AI work. Saving requests an AI commit title/body, shows an editable confirmation, and rejects empty title/body. [E03](#e03).
- [x] BRAND-17 — If commit-text generation fails, confirmation still opens with empty editable fields. Successful save commits files and disables Save until a further edit. [E03](#e03).
- [x] BRAND-18 — Entering a brand validates AI availability and repository cleanliness with recovery fallbacks before enabling work. Video-only Hyperframes checks are deferred to the video pre-page. [E03](#e03).
- [ ] BRAND-19 — Videos tab lists thumbnail when present, identification/title according to the documented decision, and a two-line theme description with an expansion action. Data is read from the packaging schema.
- [x] BRAND-20 — Existing video card opens that workspace via validation; create action starts new-video validation/onboarding. [E03](#e03).
- [x] BRAND-21 — Shared assets reuse the complete asset feature and interactions with a shared-folder scope, avoiding duplicated feature logic. [E03](#e03).

## 4. Chat, Codex sessions, and change consistency

Source: `genesis_prompt.md:L100–L121`, `L241–L247`, `L263–L367`.

- [x] CHAT-01 — Same polished chat component serves brand, video, asset, clip, recovery, and publishing contexts; composer and diff interactions follow inspected T3 behavior. [E04](#e04).
- [x] CHAT-02 — Each logical scope has a durable Codex conversation association. Reopening a scope resumes the same conversation, including after application restart. [E04](#e04).
- [ ] CHAT-03 — Open conversation tabs are horizontally scrollable, most-recent-first, and show close on hover. Closing all tabs shows a centered concise empty state with an appropriate icon/illustration.
- [x] CHAT-04 — Refresh/new-conversation action intentionally resets a scope's session; merely closing/reopening a tab does not erase its history. [E04](#e04).
- [x] CHAT-05 — Every editable form/section has a consistent AI action icon and scope-specific chat. Brand attributes share one chat; each taste document and each packaging attribute have separate chats. [E04](#e04).
- [x] CHAT-06 — Read/edit mode selector is enforced by the Codex runtime, not only a prompt. In read mode, change requests instruct the user to switch mode. Edit mode still answers questions without gratuitous edits. [E04](#e04).
- [x] CHAT-07 — Model list, valid reasoning efforts, and speed/fast-mode options derive from live supported capabilities. Unsupported combinations cannot be selected or sent. [E04](#e04).
- [x] CHAT-08 — Last chosen chat model/effort is remembered; requested Astra 6/medium default is resolved against actual available model IDs with an explicit fallback if unavailable. [E04](#e04).
- [x] CHAT-09 — Only one AI operation runs anywhere in the app at a time, including background commit generation, metadata work, repair, and upload supervision. [E05](#e05).
- [x] CHAT-10 — Active AI operation locks conflicting editors and global workspace navigation with obvious disabled/loading feedback. Stop/error handling releases the lock after cleanup. [E05](#e05).
- [x] CHAT-11 — Pending manual edits block new AI work across conflicting scopes. Saving/discarding restores availability. Staged script handoff is the sole explicit controlled exception. [E05](#e05).
- [x] CHAT-12 — Render assistant/user messages, available reasoning summaries/progress, tool activity, errors, and final changed-file summaries live. Each changed file expands to its scrollable diff. [E04](#e04).
- [x] CHAT-13 — `@` opens a filtered file picker with scope-appropriate items, file-type icons, distinct guide/config/logo treatments, and rich inline mentions. [E04](#e04).
- [x] CHAT-14 — Mentions are delivered to Codex as supported file references to the correct local paths; spaces, Unicode, duplicate basenames, deleted files, and paths outside the current scope behave predictably. [E04](#e04).
- [ ] CHAT-15 — File picker and drag/drop attachments work in every chat. Video attachments default to local video assets; shared use occurs only when explicitly requested or subsequently approved.
- [x] CHAT-16 — If a previously recorded Codex session was deleted, start a new one and toast that history was unavailable. First-ever scope use never displays a false recovery error. [E04](#e04).
- [x] CHAT-17 — Every user message receives fresh contextual instructions, not just the first turn. User text is clearly separated from app guidance. [E04](#e04).
- [x] CHAT-18 — Each contextual prompt identifies the role, main editable file/scope, explicit mandatory reads, optional files with short explanations, allowed cross-file work, read/edit restrictions, relevant Git history, and commit obligations. [E04](#e04).
- [x] CHAT-19 — Brand-config chat mandatorily reads `brand_config.yml`, knows its logo, all taste guides, and shared assets. Taste-guide chats mandatorily read their own guide and brand config, and know related guides/global assets. [E04](#e04).
- [x] CHAT-20 — Long/short guide chats explicitly identify the active format and prohibit modifying the opposite-format guide unless the user requests it. [E04](#e04).
- [x] CHAT-21 — Video prompts distinguish brand/shared assets from local assets, include brand logo context, and require asset title/description/tags before use. Explicit shared-asset requests proceed directly. [E04](#e04).
- [x] CHAT-22 — Prompts permit relevant Git-history inspection, avoid unrelated changes on questions, and require concise informative commits for all changed repositories. [E04](#e04).
- [x] CHAT-23 — On AI completion, inspect every affected/allowed repository. If dirty, use the configured inexpensive commit-only AI operation; it cannot edit project content. [E05](#e05).
- [x] CHAT-24 — If that operation fails or leaves changes, deterministic commit fallback uses meaningful affected-file information. Verify cleanliness afterward and surface errors if Git commit fails. [E05](#e05).
- [x] CHAT-25 — Apply the same commit-recovery sequence on brand entry and video entry, with blocking progress. Crash/interruption recovery preserves available conversation history and current file state. [E05](#e05).
- [x] CHAT-26 — Undo captures all affected repository checkpoints and the supported conversation boundary. Test commits made by AI itself, multiple repositories, no-file-change turns, unavailable histories, interrupted runs, and rollback failure. [E05](#e05).

## 5. Video validation, onboarding, and workspace shell

Source: `genesis_prompt.md:L368–L435`.

- [x] VIDEO-01 — Workspace tabs are Packaging, Creation workspace, Manual video editing, Asset creation, Clips creation, and Launch Suite; open and test every tab individually. [E06](#e06).
- [x] VIDEO-02 — Clips and Launch Suite are disabled until the required video output exists. Vertical projects do not show Clips. [E06](#e06).
- [x] VIDEO-03 — Before workspace entry, validation shows completed/total percentage and the current dependency/task label, with deterministic progress rather than an arbitrary animation. [E06](#e06).
- [x] VIDEO-04 — Validate Codex installation, actual executable operation, authentication, and available access/limits using supported APIs where possible; do not infer a successful AI turn from executable presence alone. [E06](#e06).
- [x] VIDEO-05 — Validate Git, Hyperframes runtime, Studio, Codex Hyperframes plugin, project format, and actual extra runtime dependencies discovered during integration. [E06](#e06).
- [ ] VIDEO-06 — Missing dependency stops entry at an actionable error with Retry. Failed retry shows a toast and keeps the problem visible; successful retry continues and closes repair chat.
- [ ] VIDEO-07 — AI-repairable problems offer a left-side repair chat with prepared editable instructions; the user sends them explicitly. Chat does not initially occupy the page.
- [ ] VIDEO-08 — Missing/unavailable Codex, login, or quota access gets an appropriate official setup/login/account action rather than an impossible AI repair button.
- [x] VIDEO-09 — Validate cleanliness of brand plus video repositories with commit fallback; failure to commit visibly prevents inconsistent entry. [E06](#e06).
- [ ] VIDEO-10 — Validate packaging schema and recover malformed packaging from the latest compatible Git revision, with a preserved copy of invalid user content and clear recovery feedback.
- [x] VIDEO-11 — Ensure all shared assets are available to the video/Hyperframes project and mentions on every entry, including assets added after the video was created. [E06](#e06).
- [x] VIDEO-12 — New-video onboarding offers only 16:9 horizontal and 9:16 vertical, with genuine relevant platform icons, and a required identification name distinct from release title. [E06](#e06).
- [x] VIDEO-13 — Identification input safely becomes a folder name, including reserved Windows names, traversal, separators, collisions, whitespace, and Unicode handling. [E06](#e06).
- [x] VIDEO-14 — Successful onboarding initializes the real project and first Git commit before entering Packaging; a failed create can be retried without orphan projects. [E06](#e06).

## 6. Packaging

Source: `genesis_prompt.md:L436–L457`.

- [x] PACK-01 — Two panes: context chat left and editable packaging right; there is no duplicated brand-guide editor. [E07](#e07).
- [x] PACK-02 — Typed/validated `video_packaging.yml` stores long/short title candidate lists, long/short descriptions, long/short tag lists, video theme, and thumbnail ordering. Identification remains the separate project name. [E07](#e07).
- [x] PACK-03 — Multiple title candidates support the intended A/B workflow; no unsupported publishing capability is falsely advertised. [E07](#e07).
- [ ] PACK-04 — Thumbnail folder supports manual image upload, AI creation, meaningful descriptive filenames, rename when contents change, reordering, and any number of candidates.
- [ ] PACK-05 — First thumbnail is the main one; launch selects only the supported number of leading candidates for the platform.
- [x] PACK-06 — Manual packaging/thumbnail-order edits follow editable commit confirmation and remain in draft until save. AI and manual editing lock one another consistently. [E07](#e07).
- [x] PACK-07 — Each attribute's AI chat reads `video_packaging.yml` and the matching taste guide; thumbnail chat focuses on `thumbnails/` and knows packaging order, thumbnail taste, visual identity, and brand context. [E07](#e07).
- [x] PACK-08 — Packaging prompts know brand identity and allow user-requested updates to taste guides with commits in every affected repository. [E07](#e07).
- [x] PACK-09 — External YAML changes are validated before entry, with deterministic latest-valid-version recovery and verification of the recovered schema. [E07](#e07).

## 7. Creation workspace and script-driven editing

Source: `genesis_prompt.md:L458–L522`.

- [x] CREATE-01 — Left pane switches between Script and AI chat; right pane shows current video preview and commit history. [E08](#e08).
- [x] CREATE-02 — Preview updates after AI operations and manual Studio saves, without stale output after switching tabs. [E08](#e08).
- [x] CREATE-03 — Commit list pages by 12; Next appears only when further commits exist. New commits refresh the list and return it to the first page. [E08](#e08).
- [ ] CREATE-04 — Commit card shows title, two-line expandable description, copy-SHA action, and changed-file rows with additions/deletions and expandable scrollable diffs.
- [x] CREATE-05 — Script starts from `script.md`; manual typing stays in application memory until the confirmed handoff. [E08](#e08).
- [x] CREATE-06 — Editor has reset-to-file, Undo, Redo, Diff, and Save. Disabled states reflect actual draft/file equality and undo/redo availability. [E08](#e08).
- [x] CREATE-07 — Reset itself is undoable. Keyboard undo/redo and font controls behave consistently with the markdown editing pattern. [E08](#e08).
- [ ] CREATE-08 — Dirty script disables AI-chat selection until reset or confirmed save. Diff dialog accurately compares draft with disk, including Unicode and line-ending cases.
- [x] CREATE-09 — Save dialog shows the actual diff, optional user guidance, and available model/effort selectors; cancel keeps the draft intact. [E08](#e08).
- [x] CREATE-10 — Confirm atomically writes and stages `script.md` without committing, switches to chat, and starts the synchronization turn with the chosen model/effort and optional guidance. [E08](#e08).
- [x] CREATE-11 — During synchronization, script/global navigation are blocked and live progress is visible; completion refreshes preview/history and shows a completion toast only after verification/commit cleanup. [E08](#e08).
- [x] CREATE-12 — Script-handoff prompt requires reading the staged diff against the previous committed script, active-format edit guide, actual Hyperframes skill, and relevant asset metadata, then synchronizing the video. [E08](#e08).
- [x] CREATE-13 — Direct creation-chat prompt also synchronizes every video change back into script, preserves its existing structural style, and mandatorily reads the active-format script and edit guides. [E08](#e08).
- [ ] CREATE-14 — Every used asset appears in script using the same path/mention representation as a user mention, including visual and audio assets.
- [ ] CREATE-15 — All video assets are searchable mention candidates; attached files enter the local asset flow.
- [x] CREATE-16 — Only an empty script first authored through chat receives researched initial Hyperframes script-structure guidance. Manual-first edits and nonempty scripts do not receive inappropriate boilerplate. [E08](#e08).
- [x] CREATE-17 — Failed or interrupted synchronization keeps the user's script recoverable, identifies unfinished video work, performs required commit recovery, and resumes the same available chat. [E08](#e08).

## 8. Embedded manual editor

Source: `genesis_prompt.md:L523–L533`.

- [x] STUDIO-01 — Embed actual Hyperframes Studio, with current project/preview and shared assets; do not substitute a screenshot or unrelated custom editor. [E09](#e09).
- [x] STUDIO-02 — Entering Studio reflects current AI changes. Studio startup, shutdown, port allocation, crash, and stale-process recovery are managed by the app. [E09](#e09).
- [x] STUDIO-03 — Pinned upstream integration has an upgrade guide or local skill describing version update and compatibility verification. [E09](#e09).
- [x] STUDIO-04 — Leaving Studio checks actual Git changes. Clean projects navigate without a dialog; dirty projects offer Save, Discard, and the ability to remain editing. [E09](#e09).
- [x] STUDIO-05 — Save shows commit-generation progress, editable title/body confirmation, and expandable actual file diffs. [E09](#e09).
- [x] STUDIO-06 — Before completing manual save, a configured inexpensive/high-effort AI operation updates `script.md` to accurately reflect manual changes with a specific synchronization prompt. [E09](#e09).
- [x] STUDIO-07 — Save commits synchronized changes and refreshes all preview/history state; discard restores the captured manual-edit baseline and does not remove unrelated user files. [E09](#e09).
- [x] STUDIO-08 — Commit-generation/synchronization failure is visible and recoverable; do not claim a synchronized script when AI reconciliation failed. [E09](#e09).

## 9. Assets and metadata

Source: `genesis_prompt.md:L176–L179`, `L351–L360`, `L424`, `L534–L553`.

- [x] ASSET-01 — Identical reusable asset page serves shared and local folders: chat left, asset grid middle, selected-asset inspector right; inspector has an intentional empty state. [E10](#e10).
- [x] ASSET-02 — Video asset storage is the actual Hyperframes asset directory through the documented path mapping; assets are ready for rendering without redundant import copies. [E10](#e10).
- [ ] ASSET-03 — Type filters include image, audio, video, all enabled by default; GIF previews are supported.
- [ ] ASSET-04 — Add via filesystem picker and drag/drop. Detect already-present content before import, including different names for the same bytes.
- [x] ASSET-05 — Import opens loading then editable proposed title, description, and tags generated by the configured inexpensive AI. AI sees existing tags and may suggest new ones. [E10](#e10).
- [x] ASSET-06 — User confirms metadata before copying into project; cancel leaves the original untouched and no half-imported asset. AI failure permits a clear manual metadata fallback. [E10](#e10).
- [x] ASSET-07 — Persist title/description/tags in supported embedded media metadata, with lossless sidecar fallback where needed. Metadata remains accessible to AI, index, and external tools; never silently transcode or corrupt source media. [E10](#e10).
- [x] ASSET-08 — Recursively map assets and metadata on entry; build tag filters from actual contents, including nested folders. [E10](#e10).
- [x] ASSET-09 — Normal browsing preserves folder navigation. Search spans titles and descriptions and presents matching results across folders; filtering/search uses a premapped index. [E10](#e10).
- [x] ASSET-10 — Index refreshes after AI, manual, external, and shared-asset changes without requiring application restart. [E10](#e10).
- [ ] ASSET-11 — Folder chat can create/import/delete assets and knows brand config plus visual-identity guide; its changes are committed.
- [ ] ASSET-12 — Selecting image shows preview and copy-to-clipboard; video has playback; audio has playback and waveform; animated images remain animated.
- [x] ASSET-13 — Inspector displays editable title/description/tags with standard save/commit and dirty-lock behavior. [E10](#e10).
- [x] ASSET-14 — Asset-specific AI action opens/resumes a clearly named selected-asset scope, distinct from general folder chat. [E10](#e10).
- [x] ASSET-15 — Local/shared distinction survives import, delete, edits, resynchronization, and clip references; no existing local asset is overwritten by a same-named shared file. [E10](#e10).
- [ ] ASSET-16 — Deletion and rename handle script/project references and unavailable files coherently; destructive loss does not occur silently.

## 10. Clips

Source: `genesis_prompt.md:L554–L578`.

- [x] CLIP-01 — Clips are available only for horizontal parent projects with usable video output. [E11](#e11).
- [x] CLIP-02 — Clip list selects a preview on the right and opens its editor through inner tab navigation. [E11](#e11).
- [x] CLIP-03 — New-clip onboarding occupies the full tab, validates prerequisites, and requires a title plus 9:16 or 1:1 aspect ratio. [E11](#e11).
- [x] CLIP-04 — Onboarding lays out title/ratio left and parent preview right, with start/end range controls and initial guidance beneath the timeline. [E11](#e11).
- [x] CLIP-05 — Playback previews only the chosen range; selected-ratio overlay is a visual guide. Validate start < end, boundaries within duration, and usable duration. [E11](#e11).
- [x] CLIP-06 — Confirm creates the clip's real repository/project and starts generation. App is locked while live progress is shown. [E11](#e11).
- [x] CLIP-07 — First-clip prompt is distinct from iterative edits, includes range/ratio/guidance, parent project/assets, short-form editing taste, and permission to create needed assets. [E11](#e11).
- [x] CLIP-08 — Iterative clip prompt knows both repositories but edits only the clip unless parent edits are explicitly requested. [E11](#e11).
- [x] CLIP-09 — Successful creation enters clip workspace with the exact generation conversation resumed. [E11](#e11).
- [x] CLIP-10 — Clip workspace has chat left, packaging middle, and current ratio-correct preview right. Packaging uses the same title/description/tag/thumbnail behavior where relevant. [E11](#e11).
- [x] CLIP-11 — Packaging AI scopes can be opened/closed while retaining the default clip-edit conversation and history. [E11](#e11).
- [x] CLIP-12 — Clip can be generated through natural-language cut instructions and supports requested new animations; it remains independently editable without breaking its parent. [E11](#e11).

## 11. Launch Suite and publication

Source: `genesis_prompt.md:L579–L605`.

- [x] LAUNCH-01 — Video-local launch YAML records per-platform and per-selected-video/clip status plus published URL; survives app restart and AI/manual updates. [E12](#e12).
- [x] LAUNCH-02 — Show distinct YouTube and YouTube Shorts identities, genuine platform icons, and long-form-right/short-form-left grouping with sensible vertical-project visibility. [E12](#e12).
- [x] LAUNCH-03 — Each destination shows not posted/uploading/posted state; user can edit status and URL. Post action is available for eligible unpublished media. [E12](#e12).
- [x] LAUNCH-04 — Destination selection opens an inner-tab review page populated from packaging; temporary per-release changes remain in memory until the release flow saves its manifest. [E12](#e12).
- [x] LAUNCH-05 — Release review has no chat pane, supports manual metadata edits, and requires the logged-in browser if not configured at brand level. [E12](#e12).
- [x] LAUNCH-06 — YouTube review offers AI chapter generation using complete video/script context and the YouTube-sections taste guide, with loading feedback. [E12](#e12).
- [x] LAUNCH-07 — Chapter results are inspectable/editable in a dedicated dialog with full video preview and timestamp controls; invalid, unordered, or out-of-duration points are rejected. [E12](#e12).
- [x] LAUNCH-08 — Final publish action opens a prepared but unsent editable user message; the user explicitly sends it. App guidance remains separate and cannot be replaced by editing the visible message. [E12](#e12).
- [x] LAUNCH-09 — Publish prompt requires brand config, correct destination URL, requested browser, desired account identity, selected media, final packaging/chapters, and launch-manifest path. [E12](#e12).
- [ ] LAUNCH-10 — Actual browser capability is available to the Codex process. It checks login and destination identity before upload; wrong account blocks posting unless it can select and verify the requested account.
- [ ] LAUNCH-11 — Missing login requests user login in the browser and resumes after it. Passwords/tokens are not written into chat logs or project manifests.
- [ ] LAUNCH-12 — Real upload work updates YAML to uploading, monitors actual progress with bounded waits until success/error, then stores verified URL and posted state.
- [ ] LAUNCH-13 — App remains locked during upload supervision and releases on completion/failure; cancellation/interruption has a recoverable status rather than a false posted result.
- [x] LAUNCH-14 — Long-form destinations choose parent video automatically. Short-form destinations offer available clips; vertical source projects can publish their own video. [E12](#e12).
- [x] LAUNCH-15 — With no suitable clips/media, offer choosing a local video and navigating to clip creation where applicable. Imported publishing-only media proceeds through the same review/upload flow. [E12](#e12).
- [ ] LAUNCH-16 — Platform differences (supported title/thumbnail candidates, media formats, tags, descriptions, chapters) are handled by explicit adapters/capability checks rather than pretending all destinations behave identically.

## 12. Design, localization, settings, and desktop behavior

Source: `genesis_prompt.md:L606–L650`, `L671–L676`, `L711–L712`.

- [ ] UX-01 — App visually follows inspected Hyperframes Studio tokens; chat follows T3; the embedded editor feels part of the same application.
- [ ] UX-02 — Provide a distinct application icon, installed application/window identity, and appropriate platform icon resources.
- [ ] UX-03 — Keep copy concise: meaningful titles and info-icon tooltips rather than gratuitous subtitles or filler text.
- [x] UX-04 — Tooltips may use selective bold/emphasis and accessible rich help, with scrolling/images only when useful; no broken media or unreadable decorative text. [E07](#e07).
- [ ] UX-05 — Horizontal scrollables reach the component edges and keep padding inside the scrolling content, not around the scroll viewport.
- [ ] UX-06 — Desktop panes remain usable at the native minimum, common sizes, and large windows; focus, keyboard access, dialog dismissal, loading, empty, error, and disabled states are checked.
- [x] I18N-01 — English keyed-string architecture is in place immediately; actual translations start only after app functionality is finished. [E13](#e13).
- [x] I18N-02 — App and later landing page support English, Japanese, French, Spanish, German, Korean, Brazilian Portuguese, and Italian; unsupported locales fall back to English. [E15](#e15).
- [x] I18N-03 — Japanese uses natural kanji/kana; Korean uses Hangul. Translation review includes actual UI context, glyph coverage, wrapping, interpolations, and pluralization.
- [x] I18N-04 — Hyperframes Studio may remain in its upstream language; the surrounding shell and app-owned help are translated.
- [x] SET-01 — Fixed top-right settings icon is available on brand selection and brand page. [E03](#e03).
- [x] SET-02 — Settings change app language and automatic-operation model/reasoning preferences individually, including commit text, metadata, chapter generation, and manual-edit script synchronization.
- [x] SET-03 — Automatic operations default to available Luna-class/medium reasoning except justified high-effort tasks; settings persist and cannot select unsupported capabilities. [E13](#e13).
- [x] SET-04 — Chat preferences are separate from automatic-operation settings and preserve the last selected model/effort. [E13](#e13).

## 13. Landing site, documentation, delivery, and final review

Source: `genesis_prompt.md:L652–L670` and `L678–L714`.

- [ ] SITE-01 — Build the landing site only after the app is complete, then host it on GitHub Pages under the repository/account URL without requiring a custom domain.
- [x] SITE-02 — Landing highlights open source and free Vandashi software, accurately explains supported Codex/ChatGPT access requirements, and links the source. [E15](#e15).
- [x] SITE-03 — Use strong web-design guidance/research, concise useful copy, and a distinctive design; app screenshots are accurate if used. [E15](#e15).
- [x] SITE-04 — Verify mobile/desktop and intermediate viewport responsiveness with real browser use and no clipped controls/content. [E15](#e15).
- [x] SITE-05 — Detect browser language, support all requested locales, and fall back to English; language can be deliberately selected where provided. [E15](#e15).
- [x] DOC-01 — Human-readable GitHub README explains what the app does, setup, usage, prerequisites, and current integration limitations accurately. [E14](#e14).
- [ ] DOC-02 — README includes real app screenshots, landing URL after deployment, and a copy/paste prompt for an agent to clone, install, run, and open the app.
- [x] DOC-03 — Maintain architecture/integration/upgrading guidance and records of material decisions. Re-read genesis for every feature and after context compaction. [E14](#e14).
- [ ] QA-01 — Before each meaningful commit, evaluate UX simplicity, edge cases, all lint rules, documentation updates, and no warnings/errors; run relevant tests.
- [ ] QA-02 — Manually test every screen, tab, shared-component use, and real external integration with computer use. Record exactly what was and was not exercised.
- [ ] QA-03 — After implementation, assign read-only independent reviews for each genesis section using the requested highest-capability model/highest reasoning; reviewers receive the full genesis context.
- [ ] QA-04 — Fix findings, request repeat review from the same section reviewer, and continue until each section has positive evidence-backed acceptance. Then retest the affected feature in the real app.
- [ ] QA-05 — Zero static-analysis errors/warnings and all required checks pass on the final state; complete feature/module commits and push the resulting repository to GitHub.
- [ ] QA-06 — Deployment/build/push success is verified from actual results; report environmental blockers and unverified platform/account behavior without claiming completion.

## Explicit scope boundaries from the source

The current genesis prompt does **not** request voice input, narration/TTS, voice cloning, a standalone speech-recognition feature, or a standalone terminal pane. Internal speech sampling supports the requested automatic audio-asset descriptions; it does not add a separate transcription product. Audio assets and waveforms are requested (ASSET-12). Codex, Git, Hyperframes CLI/runtime, installation recovery, and process management are requested (ENG-12, VIDEO-04–08, STUDIO-02). Future user additions should be appended and traced here rather than inferred into the present scope.

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

### Evidence reconciled 2026-09-23

This is a documentation reconciliation, not a new test run. The primary execution record is
[the native verification journal](MANUAL-VERIFICATION.md); commands and boundaries are in the
linked integration documents. The older 55-test storage-only snapshot is superseded by these
workflow records. Counts below describe named runs, never a sum of overlapping suites or a
claim that the final state passed every acceptance check.

The latest coordinated `npm run check` passed: formatting, types, zero-warning lint,
architecture (205 modules, 878 dependencies), production build, and **453 tests passed /
13 skipped** across 69 passing and six skipped test files. The full native run executed
81 cases: 80 passed and one existing modal assertion expected an old brand-error control.
After correcting that selector for the inline alert and Check again action, all four cases
in the focused modal rerun passed in 3.8 seconds. All 81 scenarios are therefore verified
across the full run and focused rerun, not claimed as one uninterrupted green run. Both
new completion-toast cases passed in the full run. These results are a checkpoint, not
final independent acceptance. The rerun log is `/tmp/vandashi-modal-recovery-recheck.log`.

A fresh approximately 942 MiB macOS package was produced and all 40 generated output files
matched the built source-output hashes. Its actual bundled speech-worker test passed in
6.91 seconds with English and Portuguese input. The fresh packaged Studio/render test also
passed (1/1 in 46.21 seconds) with `VANDASHI_PACKAGE_AGENT_SMOKE=1`: real HTTP Studio
flush/save, actual Codex script synchronization, H.264 rendering, dimensions/duration and
decoded red title pixels, plus owned-server shutdown. It used a desktop-style minimal PATH
with `/usr/bin` Git and OS directories, and explicit FFmpeg/Chrome paths. Its log is
`/tmp/vandashi-fresh-package-media.log`. This verifies the current unsigned macOS ARM64
integration checkpoint through the production package harness; it is not a manual UI run,
Windows/Linux verification, or acceptance of the eventual translated release package.

<a id="e01"></a>
**E01 — Local product, persistence, and independent repositories.**
`domain/models.ts`, `infrastructure/storage/`, and the Electron composition root implement
local registry/preferences, readable YAML/Markdown, separate identity/shared/video/clip
repositories, and the external Codex harness. The [architecture](ARCHITECTURE.md),
`storage.test.ts`, `storage-assets.test.ts`, and creation/publication suites establish actual
files/Git, folder ownership, nested-repository isolation, image copying and persisted settings.
The journal records native-picker creation of Northstar Stories and Recovery Studio, restart
restoration, Fresh canvas seed/preview, and an independently committed live clip. Brand images
are optional until selected; the image-copy regression verifies tracked portable references
and untouched source bytes. [Finished-media imports](IMPORTED-VIDEOS.md) deliberately retain
source media and Git history without inventing a composition. The MIT source license exists;
final GitHub publication remains QA-05/06.

<a id="e02"></a>
**E02 — References, architecture, dependency boundaries, and host security.**
[CODEX.md](CODEX.md), [HYPERFRAMES.md](HYPERFRAMES.md), and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) record exact inspected T3, Codex and
Hyperframes revisions and distinguish reference work from redistributed packages. Ports,
Dependency Cruiser, strict TypeScript, type-aware ESLint and English UI keys implement the
[architecture contract](ARCHITECTURE.md). [AGENTS.md](../AGENTS.md) requires shared-consumer
checks, concise design, documentation updates, inner scroller padding and later site review.
Recorded checkpoint gates exercised real-Git/file, operation, protocol, cancellation and
recovery tests. Desktop validation/preload/Studio tests cover trusted sender/location, strict
own-method dispatch, bounded schemas, native picker/drop grants, media-only access, symlink
containment and private child-frame authorization. Native `desktop.spec.ts` confirms no
renderer Node/generic invoke, real granted imports and keep-open/close choices. This is a
bounded app-boundary verification, not a security audit of every dependency. Live Codex
fork/read-mode and real Studio execution are detailed in E04/E09.

<a id="e03"></a>
**E03 — Brands, creative guides, standard saves, settings access, and panes.**
`renderer/features/brands/`, shared Split/CommitDialog components and storage creation/image
paths provide these flows. Brand-summary, storage-creation and native workspace-editor tests
cover ordering/renames, persistence, manual draft locks, editable commit fields, unavailable
helper fallback and independent preferences. Native pane/asset geometry tests verify the
1200×720 minimum and 25%/75% splits; narrow asset library/inspector panes stack without
horizontal overflow. The journal records actual creation, saved description/guides, restart,
Home title refresh and a fresh branded composition. F01/F05/F06/F08 in the
[interim review](INTERIM-FUNCTIONAL-REVIEW.md) describe staged creation and preserved work.
All three native missing-Git/open-failure cases passed: selected parent/name survive, official
Git help is available, and retry avoids duplicate creation. Actual `.draft` video rejection
kept its value without creating a hidden project. Filesystem tests cover portable collision,
Unicode and reserved-name rules; Windows execution is still separate.
The [dedicated taste-guide research](TASTE-GUIDE-RESEARCH.md) records primary sources and
thirteen deterministic exports in `domain/templates.ts`; its real storage run passed 16 cases
for complete distinct bodies, materialization and preservation of customized guides.

<a id="e04"></a>
**E04 — Codex, scoped prompts, durable chat, references, and history hydration.**
The [Codex adapter](CODEX.md) uses CLI 0.155.1 authentication and dynamic model, effort, image
and speed capabilities. Its live test exercised the read-only OS sandbox, streaming,
persistence/restart, fork-before-turn and structured output following a read tool. Prompt,
discovery, asset-scope and chat-reference tests cover repeated contextual guidance, active
format, resolved logo paths, mandatory/optional reads, selected-asset identity, read/edit
restrictions, Git history and commit requirements. The [chat contract](CHAT.md) and native
chat/mentions/drafts/receipt suites cover path chips, keyboard/IME behavior, special paths,
selected-tab/draft persistence, reset, prepared-request conflicts, live progress and expandable
saved-file diffs. Renderer fixtures control inference; actual script, clip and thumbnail
conversations are separate journal observations. Four native image-history cases passed:
delayed grants, offline retry, Studio-busy cached history and idle-before-response ordering.
They retain drafts/selection and make one subsequent provider read. A fresh manual launch
also displayed the actual provider bitmap and local Markdown thumbnail automatically. F09
preserves the security boundary: verified provider history alone grants its exact artifact.

<a id="e05"></a>
**E05 — Operation ownership, commit recovery, receipts, and coordinated undo.**
`application/operation-gate.ts`, chats/commits/turn-receipt services and Git/storage ports own
operations through process cleanup, reconciliation and persistence. Application recovery,
startup, receipt, history, Codex-startup and Git suites exercise interrupted/uncertain starts,
helper failure, direct agent commits, multiple repositories, no-change turns, stale heads,
missing boundaries and compensation. Native modal/async-editor/receipt cases verify locks and
recoverable failures without false success. The journal records actual dirty-entry recovery,
a sandbox-denied agent commit saved by the host fallback, and Revert last change restoring
script/composition plus Codex history while retaining backup history. The live clip left its
parent clean at the same revision and showed actual saved-file diffs. Seven development
StrictMode native startup cases passed after selector corrections, covering Checks, main/clip
Preview, Studio and shared commit dialogs. Passive refresh did not replace reviewed commit
text. These controlled fixtures prove request ownership, not another live provider/render run.

<a id="e06"></a>
**E06 — Video validation, naming, entry consistency, and initialization.**
Dependency services, Checks, project creation and media diagnostics distinguish Codex
account/usage/skill checks from required Git, Hyperframes, Node, FFmpeg, FFprobe and browser
runtime checks. Optional vendor tools do not block ordinary creation. Dependency, storage,
project-creation, validation-transition and launch tests cover progress, clean entry, shared
synchronization, ratios and fresh/stale-media tab eligibility. The journal records actual
successful checks, landscape initialization/preview, dirty-entry recovery, output unlocking
Clips/Launch and invalid-name rejection. F03's staged preparation and saved-clip retry cover
media/Git/startup failures without deleting external work. A crash or failed publication can
preserve a partial folder with an explicit path error; it is not overwritten or represented as
an atomic directory/registry transaction. Full native dependency repair remains VIDEO-06–08.

<a id="e07"></a>
**E07 — Packaging data, contextual editing, and YAML integrity.**
Packaging UI, validated schemas, thumbnail storage and prompt contracts implement candidate
lists, format-specific descriptions/tags, theme, order and draft/commit locks. Native
workspace-editor/packaging regressions preserve both format drafts, multiword tags, uncropped
images and editable confirmation. A tooltip regression verifies emphasized help and dismissal.
Actual thumbnail generation produced a 1664×936 PNG, metadata and packaging-only commit; a
second native-picked candidate was reordered and saved using a real generated commit message.
`storage.test.ts` corrupts YAML, restores the latest valid Git version, preserves the invalid
backup and checks the typed recovery callback. Periodic reads use stable snapshots during
editing rather than repairing half-written YAML. Schema recovery satisfies PACK-09; the
visible entry walkthrough in VIDEO-10 remains pending. Thumbnail rename and actual platform
candidate limits remain PACK-04/05 rather than being inferred from the two-image case.

<a id="e08"></a>
**E08 — Script handoff, preview freshness, history, and recoverable editing.**
Creation UI, shared Markdown/history components, application chats and prompts implement the
draft/staged handoff. Native script/workspace-editor/packaging regressions cover Unicode diff,
undoable reset, redo/font controls, cancel/failure retention, model/guidance selection,
12-item history, final-page navigation, body expansion and return to page one. Git tests
cover exact staged rollback without losing unrelated work. Prompt tests distinguish staged,
manual-first, empty-script and direct-chat guidance; researched defaults and the Hyperframes
contract supply initial structure. Actual manual script submission produced the six-second
composition; a later real edit changed script and playback, and undo restored them. Vendor
IDs normalize before checkpointing. Fingerprint tests and the journal establish that source
edits invalidate old exports while unrelated release artwork/packaging does not.

The requested completion toast now uses the verified, persisted saved-file receipt as its
trigger. Both native `chat-receipt.spec.ts` cases passed in the coordinated 81-case run:
a successful receipt shows the toast while retaining the expandable receipt; dismissal,
duplicate delivery and reload do not replay it. No-change receipts, read-only answers,
helpers and failed turns do not show a saved-changes toast. E05's real-Git tests establish
that the receipt follows clean-repository verification and history persistence. Together
with the earlier real script synchronization and native lock/refresh evidence, this covers
CREATE-11. A subsequent real packaged Codex script turn also displayed both the persisted
receipt and completion toast after commit `0fb9fb0`, with the preview updated to 40 seconds.
Real all-assets-in-script coverage remains below.

<a id="e09"></a>
**E09 — Actual Studio, save flushing, synchronization, and export.**
[HYPERFRAMES.md](HYPERFRAMES.md) documents the pinned 0.8.64 Studio/player, upgrade procedure,
source mapping, owned processes and private frame bridge. Media runtime/bridge, desktop-Studio
and application-Studio/recovery tests cover delayed writes, failed flush, stale discard,
preserved changes, clean navigation, confirmation and cancellation. Native Studio-navigation
tests exercise the shared leave-editor path. A previously built macOS ARM64 app with Finder's
minimal PATH loaded real Studio, flushed a delayed HTTP save, ran a real Codex script-sync
turn, rendered H.264, verified red title pixels/dimensions/duration and stopped its server on
close. Live media tests also render a trimmed clip with audio. This establishes the integration;
it does **not** verify Windows/Linux behavior. The fresh macOS ARM64 checkpoint package
now separately passes both its actual speech-worker test and the complete Studio/render
smoke with real Codex enabled. The latest journal entry records real HTTP save/flush,
script synchronization, decoded rendered pixels and owned-server cleanup under minimal
PATH. Thus the current macOS result no longer relies on the older package. Final release
and cross-platform acceptance remain distinct from these scoped package smoke tests.

<a id="e10"></a>
**E10 — Shared/local assets, inspected metadata, search, and concurrent edits.**
Reusable asset UI, actual `video_assets` mapping, index, inspector/import and inspection
services are documented in [ASSET-METADATA.md](ASSET-METADATA.md) and
[ASSET-INSPECTION.md](ASSET-INSPECTION.md). Real file/Git/ExifTool tests cover embedded PNG/MP3
metadata, preserved original/compressed audio, sidecar fallback, external metadata, folders,
shared-copy conflicts, original/current-byte dedup, exact-revision rejection and unchanged Git
after stale review. The inspected source hash survives model/UI review; replacement rejects
before dedup/mutation, and reinspection works. Native asset/inspection/refresh/helper-failure
cases verify loading/coverage, editable metadata, manual fallback, cancellation cleanup,
multi-file token preservation, selected scope, dirty locks, commit confirmation, retained
conflicting drafts, reset and retry. All four asset-refresh cases passed.
Actual Codex described the city image and English/Portuguese speech; import embedded metadata
and committed copies. Real MP3 protocol coverage includes native grants, playback, seeking
and waveform. A manual restart confirmed persisted Portuguese playback reaching its endpoint.
A real 115 MB waveform fixture removes the old renderer-size limitation. The fresh macOS checkpoint package
exercised the actual ONNX worker, timestamps, preserved source, timeout and cancellation.
GIF, clipboard and complete drop interaction retain the specific acceptance gaps below;
working samples do not establish universal codec or speech-accuracy guarantees.

<a id="e11"></a>
**E11 — Independent clips, trim playback, packaging, and conversation continuity.**
Clip application/storage/media paths and native tests verify full-tab onboarding, 9:16/1:1,
numeric/range boundaries, decoded selection playback, ratio guide, pending locks, continued
generation conversation, packaging-context return and parent navigation. Prompt tests separate
initial generation from iteration and protect the parent. The journal records actual 2–6-second
selection, GPT-6-Astra generation, continued conversation, saved-file receipt, four-second
portrait playback and 1080×1920 export with 120 frames. The parent stayed clean and unchanged.
F03 native cases also verify saved-clip retry after startup/hydration failure. Imported finished
clips follow E12's direct-player exception.

<a id="e12"></a>
**E12 — Local release review, chapter UI, prepared requests, and upload-only entry.**
[PUBLISHING.md](PUBLISHING.md) and [IMPORTED-VIDEOS.md](IMPORTED-VIDEOS.md) describe the ledger,
grouping, local draft review, account/browser preflight, chapters, unsent request and import
origin. `launch.test.ts` uses real storage/Git for distinct records/scopes, dirty/format/channel
checks and chapter rules. Native launch tests decode a 60-second video in the chapter editor,
retain review edits, select the intended clip, offer create/import and keep finished clips
available while their parent is stale. Finished-media tests cover real grants, FFprobe, exact
bytes, freshness, exclusive publication and preservation on failure.
Manual top-level import opened Launch without a fake canvas and preserved the movie SHA-256.
Manual Shorts import played to four seconds, edited packaging and saved a real Luna-named
commit in its own clean repository. The imported-clip native regression passed again in the
latest focused run. F10 naming has 51 focused tests plus an actual repeated native-picker
import: `Final city` and `Final city (2)` have independent clean commits, and both copies match
the original SHA-256. A real Codex inventory call proved browser tools exist, **not** account
selection, login, upload or monitoring. Those remain LAUNCH-10–13/16. In the fresh packaged
app, real chapter generation read the new 40-second composition/script and returned
`00:00 A circle begins`, `00:15 A line connects`, and `00:30 A frame holds the story`.
The native UI showed loading and locks, opened the chapter editor with the actual rendered
movie, sought to 15 seconds, and saved the three chapters into the local upload draft.

<a id="e13"></a>
**E13 — Reviewed desktop languages, typed localization boundaries, and model preferences.**
[TRANSLATION.md](TRANSLATION.md) links seven fresh-context editorial reviews. All eight
languages have complete interface, diagnostic, and native catalogs, selected through
persisted Settings autonyms with English fallback. Tests check exact keys/tokens, duplicates,
empty values, plural categories (including Romance `many` and Portuguese numeric zero),
regional IDs, raw user/provider preservation, and local Japanese/Korean font loading.
App-owned chat headings resolve from topics while user clip/asset names stay intact.
Persistent failures and toasts retranslate without restarting requests or dismissal timers.

The coordinated 29-case localization native run passed, including eight actual Settings,
persistence, native filter/close-dialog checks; 16 minimum-window split/layout cases; three
StrictMode preview/Studio error-switching cases; and two toast/receipt/timer cases. The
subsequent full native suite passed all 110 cases. Independent visual reviewers inspected
every language's Brand, Packaging, Creation, Assets, and Launch screenshots. A clipped
Spanish asset filter was corrected and the incomplete preview fixture repaired before
clean recapture; that follow-up acceptance is recorded in the translation journal.

Native workspace-editor tests persist five separate model/effort preferences; chat tests retain
its own selection. Live discovery/validation allow supported combinations. Defaults remain
Luna-class medium, script reconciliation high and chat Astra-class medium when supported.
The landing page has eight complete catalogs and separate browser verification;
its final editorial/layout review is recorded in the site acceptance evidence.

<a id="e14"></a>
**E14 — Current setup and integration documentation.**
[README.md](../README.md) explains development-preview status, local workflows, prerequisites,
source layout, checks, account/browser limits and an agent installation prompt. Architecture,
Codex, Hyperframes, chat, assets, publishing, imports, native-source, license, localization and
decision documents identify contracts and upgrades. The full genesis was reread for this
reconciliation. Real app screenshots are now included. Deployed-site linkage and final publication remain unchecked. Local hooks can be
bypassed; the configured [CI workflow](../.github/workflows/verify.yml) must be the review gate.
Configuration is not an observed green matrix. [Packaged verification](PACKAGED-VERIFICATION.md)
distinguishes the verified fresh macOS checkpoint from remaining cross-platform and final-release acceptance.

<a id="e15"></a>
**E15 — Eight-language landing site, real screenshots, responsive browser acceptance.**
[SITE.md](SITE.md) records the separate browser-only source, research, design, source
installation prompt and local font assets. Eight complete 40-key catalogs preserve
commands and useful metadata. The language/catalog suite passes 58 cases. A fresh
production run passes 306 cases across Chromium, Firefox and WebKit, including all
eight locales at eight viewports, 200% text, failure recovery, keyboard dialogs and
production-path 404s. Independent visual review accepted the refreshed typography
fixes. The journal records direct browser checks and the real packaged-app provenance
of all four screenshots. GitHub deployment and the live README link remain SITE-01
and DOC-02; this local acceptance is not deployment evidence.

### Residual acceptance, kept explicit

These rows account for unchecked combined requirements. They distinguish a missing observation
from a demonstrated defect; they do not ask to rewrite verified behavior or start translation early.

| Unchecked IDs              | Exact remaining acceptance                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENG-07, ENG-13             | The fresh macOS checkpoint passes speech and Studio/render/Codex package smoke tests. Observe the actual CI gate and native matrix, especially Windows/Linux execution. Verify final distributed artifacts, native resources, notices and source materials; repeat relevant checks after release changes. This checkpoint does not accept the final translated release. |
| BRAND-19                   | Complete video-row thumbnail/identification/theme expansion.                                                                                                                                                                                                                                                                                                            |
| CHAT-03, CHAT-15           | Verify tab ordering/hover close/close-all empty state together and picker plus drag/drop attachments across contexts, including explicit local/shared choice. Existing drafts/mentions/grant tests cover only parts.                                                                                                                                                    |
| VIDEO-06–08                | Complete native missing-dependency retry/failure feedback and prepared repair-chat send/retry/close, including official Codex setup/login/quota routes. First-brand missing-Git recovery is separately verified.                                                                                                                                                        |
| VIDEO-10                   | Schema, backup and typed notices pass; perform malformed-packaging entry and inspect the actual feedback/backup without discarding invalid content.                                                                                                                                                                                                                     |
| PACK-04/05                 | Generation, import and reorder work. Verify content-driven filename/reference updates and actual leading candidate limits with platform/account capability, rather than prompt instructions alone.                                                                                                                                                                      |
| CREATE-04/08, CREATE-14/15 | Locks, refresh, saved-file receipt, history diff display and Unicode script diff work. Verify the history copy-SHA action and line-ending-specific diff behavior. Verify a real visual/audio asset edit records every used asset with the common mention representation, plus attachment import from Creation.                                                          |
| ASSET-03/04/11/12/16       | Complete animated GIF, image clipboard, picker/drop interaction and an actual folder create/import/delete AI turn. Reference-aware deletion and unavailable-asset scope rejection pass; filename rename/reference repair still lacks a complete exercised scenario. Verify supported media rather than assuming every format.                                           |
| LAUNCH-10–13/16            | Complete authorized test-account publication: browser/account verification, login/account recovery, destination fields/candidate limits, upload/processing monitoring, verified URL/manifest, cancellation/error recovery and lock release. No external upload has occurred.                                                                                            |
| UX-01–03, UX-05/06         | Complete independent visual/style, installed icon/identity, concise-copy and all-consumer layout/accessibility review. Minimum/split and several modal/keyboard/tooltip states pass; this is not exhaustive all-screen/size acceptance.                                                                                                                                 |
| SITE-01, DOC-02            | The local site, translations, real screenshots and installation prompt pass browser/visual acceptance. Deploy Pages, observe the public URL, and add that verified link to README.                                                                                                                                                                                      |
| QA-01–06                   | Maintain per-commit checks, then run final-state static/tests and real integration/manual acceptance. Conduct the requested strongest-model/highest-effort independent section review/fix/re-review loops. Verify final artifacts, GitHub push and deployment. Interim audits and historical green checkpoints do not satisfy the final loop.                           |

Native source archives and licensing have separate recorded evidence. Release acceptance still
requires the actual delivered artifacts to include their corresponding materials. The current
macOS integration checkpoint is verified as described above. Final distributed packages,
Windows/Linux execution, external account workflows, site deployment and final
section audits remain unaccepted by this documentation update.
