# Taste guide research and editorial decisions

Research date: **2026-09-23**. Scope: the thirteen editable English defaults in
[`src/domain/templates.ts`](../src/domain/templates.ts), fulfilling BRAND-11, BRAND-14,
and BRAND-15 in the original brief. This was a dedicated research and implementation
pass after rereading the complete `genesis_prompt.md`, `AGENTS.md`, and the requirements
matrix. It is not the separate final application audit.

## What the defaults are for

The guides give a new brand usable creative preferences immediately. They are not
questionnaires, generated marketing copy, or instructions to maximize a supposed
universal algorithm score. All thirteen are static exported strings in one file;
brand creation writes their full contents to the identity repository without an AI
call. `initialScript` remains empty. A user's saved guide becomes that brand's
authority; opening the brand or creating a video does not reinstall these defaults.

The editorial approach is original synthesis: concrete promises, visible evidence,
readable compositions, and a production document that an agent can actually follow.
The paper-bridge examples are newly written hypothetical examples, not reported
experiments or examples copied from a creator. Each explicitly depends on the video
containing the described material.

## Source selection and limits

Platform help centers and first-party creator guidance were preferred over search
optimization blogs, engagement anecdotes, and skill popularity. Platform documentation
establishes what a feature does; it does not prove that an aesthetic choice will work
for every audience. Accessibility guidance contributes concrete usability checks.
The installed official Hyperframes skills establish the composition contract and
provide useful creative direction, with their stylistic opinions considered separately.

The following sources were read. Descriptions below identify the particular evidence
used, rather than endorsing every recommendation or marketing claim on each page.

| Primary source                                                                                                                         | Evidence used and effect on the defaults                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [YouTube: thumbnail and title tips](https://support.google.com/youtube/answer/12340300?hl=en)                                          | Accurate promises, meaningful words early, audience-dependent packaging, and understandable thumbnails. Search-oriented and curiosity-oriented titles are different editorial choices.                                                                  |
| [YouTube: A/B test titles and thumbnails](https://support.google.com/youtube/answer/16391400?hl=en)                                    | Current native testing includes titles and combinations, subject to eligibility; Shorts are excluded. Its outcome uses watch time, not CTR alone. The guides preserve candidate order and avoid promising that testing exists on every account.         |
| [YouTube: video description tips](https://support.google.com/youtube/answer/12948449?hl=en)                                            | Useful video-specific opening lines, natural topic terms, and checking the displayed description. The longer release-note structure is our editorial choice.                                                                                            |
| [YouTube: add tags](https://support.google.com/youtube/answer/146402?hl=en)                                                            | Tags play a limited discovery role; genuine misspellings can help. This directly rejects filling a field with keyword permutations.                                                                                                                     |
| [YouTube: hashtags](https://support.google.com/youtube/answer/6390658?hl=en)                                                           | Visible hashtags have their own syntax and relevance rules. The defaults distinguish these from internal tag fields instead of treating them as interchangeable.                                                                                        |
| [YouTube: sharing links](https://support.google.com/youtube/answer/13748639?hl=en)                                                     | Shorts description and comment URLs are non-clickable; profile and related-video links are separate surfaces. Captions must offer an achievable next step.                                                                                              |
| [YouTube: add a related video to a Short](https://support.google.com/youtube/answer/14075157?hl=en)                                    | Related-video linking is an account feature, not a reason to fabricate a working link or assume any destination can be selected.                                                                                                                        |
| [YouTube: video chapters](https://support.google.com/youtube/answer/9884579?hl=en)                                                     | Manual chapter format starts at 00:00, uses at least three ascending entries, and requires sections of at least ten seconds. Manual chapters override automatic ones; availability also has conditions.                                                 |
| [YouTube: audience retention](https://support.google.com/youtube/answer/9314415?co=GENIE.Platform%3DDesktop&hl=en)                     | An opening should fulfill the package's promise. A replay spike can indicate interest or confusion; the guide therefore avoids treating every metric pattern as proof of a particular editing rule.                                                     |
| [YouTube: Shorts search and discovery](https://support.google.com/youtube/answer/11914225?co=YOUTUBE._YTVideoType%3Dshorts&hl=en)      | Recommendations consider viewing behavior and personalization. It does not establish a mandatory format or publishing cadence. No guaranteed duration, hook formula, or hashtag count is encoded.                                                       |
| [YouTube: performance FAQ](https://support.google.com/youtube/answer/141805?hl=en)                                                     | Content and audience context matter; there is no universal ideal video length. Duration remains an editorial decision.                                                                                                                                  |
| [TikTok: Creative Codes](https://ads.tiktok.com/business/en/creative-codes)                                                            | Vertical composition, interface space, a comprehensible sequence, and purposeful sound are useful production ideas. This is advertising guidance: its conversion framing and performance claims are not recast as universal organic-video requirements. |
| [TikTok: how content is recommended](https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content)        | Content information is one part of recommendation and search systems alongside user behavior and other signals. A tag list cannot establish a reach guarantee.                                                                                          |
| [Meta: cracking down on Facebook spam, April 2025](https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/)           | Unrelated captions and excessive hashtag spam are poor defaults. This does not mean every long caption is undesirable: necessary context remains welcome.                                                                                               |
| [Meta: original Facebook content, March 2026](https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/amp/)          | Superficial changes to another creator's post do not establish originality under the described recommendation policy. The guide separates editing craft, originality, and permission to use footage.                                                    |
| [Meta: Instagram best-practices education hub](https://about.fb.com/news/2024/10/best-practices-education-hub-creators-instagram/amp/) | Creator guidance can be personalized and updated in the account. The defaults refer to current destination guidance instead of inventing permanent Reels length or hashtag rules.                                                                       |
| [W3C WAI: prerecorded captions](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html)                                 | Captions convey meaningful audio information, synchronize with it, and avoid obstructing relevant visuals. Animated keywords alone need not supply that information. These guides do not claim full WCAG conformance.                                   |
| [W3C WAI: contrast](https://www.w3.org/WAI/perspective-videos/contrast/)                                                               | Foreground content needs sufficient distinction from its real background. The templates ask for checks on actual imagery, not merely a selected text color.                                                                                             |

The numeric chapter constraints are useful enough to state explicitly; the guide also
requires rechecking them before publication. Checking the final remainder against the
ten-second minimum is our explicit application of the minimum section length. It is
not an extra claim that the source separately describes a different final-chapter rule.
Other changing upload limits, safe-area dimensions, and tool availability remain
destination checks rather than permanent creative preferences.

No current ranking rules for Odysee, Rumble, or X are claimed. The common editorial
guides still apply there, while actual field support and limits must be verified at
publication. Researching a platform feature does not demonstrate Vandashi has executed
an external upload, run an experiment, or read private account analytics.

## Hyperframes evidence and adaptation

The installed runtime was **Hyperframes 0.8.64**. The following installed skill files
were compared byte-for-byte with the official reference repository at commit
[`ed75203cb6aa597269b9821fa293b4e9ad40b7ba`](https://github.com/heygen-com/hyperframes/tree/ed75203cb6aa597269b9821fa293b4e9ad40b7ba);
all eight matched. The source paths below are pinned to that revision for review.

| Official file                                                                                                                                                               | Use in the templates                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [skills/hyperframes/SKILL.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes/SKILL.md)                          | Consult the installed entry skill and route to the relevant current instructions. Avoid freezing a large implementation recipe inside a brand taste file.                          |
| [skills/hyperframes-core/SKILL.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-core/SKILL.md)                | Framework media ownership, seekable timelines, explicit composition duration, and preserving the existing project contract. Verification includes backward seeking and the ending. |
| [skills/hyperframes-creative/SKILL.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-creative/SKILL.md)        | Existing brand direction and scene intent precede implementation. New scenes, audio, or other scope should not appear merely to satisfy a generic style.                           |
| [story-spine.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-creative/references/story-spine.md)             | Give each scene a purpose and connect visual evidence to the video's value. Product-launch sequencing is not imposed on every genre.                                               |
| [beat-direction.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-creative/references/beat-direction.md)       | Describe visible action and transitions concretely. Our scene convention expresses a starting state, a change, a readable hold, and a handoff.                                     |
| [narration.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-creative/references/narration.md)                 | Writing should work aloud and allow pauses. Speech-rate estimates cannot verify timestamps or establish that a recording exists.                                                   |
| [house-style.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-creative/references/house-style.md)             | Consider subject-appropriate style instead of repetitive generic layouts. Its particular effects, decorative density, and motion preferences are not mandatory brand defaults.     |
| [video-composition.md](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/skills/hyperframes-creative/references/video-composition.md) | Think in video frames and preserve established brand choices. Numeric artistic prescriptions are not treated as technical requirements.                                            |

The application-specific additions come from the brief and implemented storage model:
all used assets appear as real Vandashi mentions in `script.md`; missing material is
identified honestly; local clip time is separate from parent source in/out time;
shared assets are edited at their authoritative source. Scripted narration must not
imply built-in speech synthesis. Preview/Render and reporting unverified checks reflect
the actual host workflow; a successful lint does not prove correct pixels or audio.

## Decisions for each of the thirteen files

These are editorial defaults, not statements that the cited platforms require this
exact writing style, number of alternatives, palette, or narrative structure.

| Guide                                    | Concrete preference and reason                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TITLE_LONG_FORM_VIDEOS_TASTE.md`        | Name the subject, choose a search or browsing angle, and make alternative promises genuinely different. Examples depend on real content. This creates useful candidates without synonym churn. |
| `TITLE_SHORT_FORM_VIDEOS_TASTE.md`       | Package the excerpt's complete idea and check it beside the first frame. This avoids promising the whole parent video or assuming a feed viewer already has context.                           |
| `DESCRIPTION_LONG_FORM_VIDEOS_TASTE.md`  | Put video-specific meaning first, then optional supporting material, chapters, credits, and one useful next step. Omit empty sections and never publish unresolved placeholders.               |
| `DESCRIPTION_SHORT_FORM_VIDEOS_TASTE.md` | Add the missing context instead of repeating the hook. Preserve necessary qualifications, and point to a link surface that actually works.                                                     |
| `THUMBNAIL_TASTE.md`                     | Develop different visual concepts using a focal subject, evidence, or a fair comparison. Inspect small size, avoid manufactured proof, and preserve reviewed candidate order.                  |
| `VISUAL_IDENTITY_TASTE.md`               | Start with a restrained editorial system that adapts to the subject. Two neutrals and an accent are an editable palette preference; the application's dark UI is not the channel's identity.   |
| `TAGS_LONG_FORM_VIDEOS_TASTE.md`         | Select precise coverage and useful naming variants. Plain packaging labels are separate from destination hashtag formatting. Filling every slot is not the objective.                          |
| `TAGS_SHORT_FORM_VIDEOS_TASTE.md`        | Derive the narrower vocabulary from the excerpt and account context. Do not inherit every parent tag or prescribe a magic count.                                                               |
| `YOUTUBE_SECTIONS_TASTE.md`              | Use real transitions in the final export, enforce format and minimum section lengths, and seek-check every boundary. If meaningful valid chapters are impossible, omit them.                   |
| `SCRIPT_LONG_FORM_VIDEOS_TASTE.md`       | Combine a coherent spoken argument with exact visual direction, evidence, media, and timing. The script is useful to both a person and an implementing agent.                                  |
| `SCRIPT_SHORT_FORM_VIDEOS_TASTE.md`      | Deliver a standalone point, preserve source meaning, and direct the actual reframed composition. A clip is not merely the original script with words deleted.                                  |
| `EDITS_LONG_FORM_VIDEOS_TASTE.md`        | Let comprehension drive rhythm, hold evidence, protect the mix, and verify a seekable composition. Direct cuts are a default taste, not an absolute rule.                                      |
| `EDITS_SHORT_FORM_VIDEOS_TASTE.md`       | Compose for the selected ratio, check captions and overlays, preserve the payoff, and keep work in the clip project. Avoid unsupported universal cut rates.                                    |

Several tempting defaults were deliberately excluded: an obligatory six-second hook,
daily posting quota, minimum number of effects, fixed caption word count, universal
loudness target, a claim that faceless work must show a person, and an automatic CTA
on every clip. None is necessary to satisfy this brief, and the sources do not justify
making them unconditional. The guides instead explain the decision a creator should
make and the evidence to inspect.

## Attribution and license provenance

The template prose, examples, organization, and application-specific conventions were
authored for Vandashi. No article, skill body, artwork, code sample, or third-party
template was pasted into the defaults. Source links support factual constraints and
identify conceptual references; they do not imply endorsement by those organizations.
The defaults use the repository's existing MIT license.

The consulted Hyperframes repository identifies **Copyright 2026 HeyGen, Inc.** and
uses [Apache License 2.0 at the reviewed revision](https://github.com/heygen-com/hyperframes/blob/ed75203cb6aa597269b9821fa293b4e9ad40b7ba/LICENSE).
No Hyperframes source files or skill text were redistributed by this template change.
Existing packaged dependencies keep their own licensing obligations. This pass added
no dependency, downloaded creative asset, or installed community skill. Public and
popular skills were not treated as authority merely because of adoption statistics.

## Validation and maintenance

The existing real-filesystem storage suite now checks that all thirteen guides are
created with distinct substantial Markdown bodies, contain no unfinished placeholder
markers, have resolvable guide references, and match their on-disk contents. Another
test edits one guide through the save API, restarts storage, creates another brand and
a new video, and verifies that the original customization survives, other guides stay
unchanged, the new brand receives deterministic defaults, and the new script is empty.

These tests verify materialization and preservation, not artistic quality or a promise
of improved views. The editorial pass evaluated each guide for a usable starting
preference, an actionable process, truthful constraints, and separation from its
counterpart. Recheck the linked platform pages when revising facts. New defaults apply
to new brands; migration of an existing user's edited guide needs a separate deliberate
product decision and is not part of this change.

Verified for this change on 2026-09-23:

- `npx vitest run tests/storage.test.ts`: 16 tests passed using real temporary repositories.
- `npm run typecheck`: passed.
- `npx eslint src/domain/templates.ts tests/storage.test.ts --max-warnings 0`: passed.
- Prettier applied to all three changed files. The thirteen bodies range from 263 to
  372 words, excluding headings; no startup model request or dependency was added.

The root task owns the complete application gate and the integration commit.
