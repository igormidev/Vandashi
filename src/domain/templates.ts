import type { tasteFiles } from './defaults';

/**
 * Original, deterministic, editable creative defaults researched on 2026-09-23.
 * Sources, distinctions between evidence and taste, and provenance:
 * docs/TASTE-GUIDE-RESEARCH.md. These preferences do not promise distribution.
 * Brand feedback can replace them; creating or opening a video must not do so.
 */
export const tasteTemplates: Record<(typeof tasteFiles)[number], string> = {
  'TITLE_LONG_FORM_VIDEOS_TASTE.md': `# Long-form titles

## The promise I want to make
Specific, credible, and interesting to someone who does not know this channel yet.
Name the subject early; make the reason to watch clear without needing the thumbnail
to decode the sentence. Use natural spoken language and sentence case by default.
Put episode numbers and recurring series branding after the useful information.
These are starting preferences; preserve an established brand voice when it differs.

## Find the angle before writing
Read the actual script and available evidence. Identify the intended viewer, their
question, the answer this video delivers, and the most distinctive demonstration.
Choose whether this upload primarily answers a searchable question or invites a
curious browsing viewer. A useful tutorial may name the task directly; an essay may
lead with its tension. Neither approach is a universal ranking trick.

When alternatives are requested, default to three different promises: the practical
question, the revealing explanation, and the concrete experiment or story. Change
the angle, not just adjectives. For a video that really compares three paper bridges,
illustrative directions are “Which paper bridge holds more?”, “What folding changes
in a paper bridge”, and “Three paper bridges, one load test”. Do not transplant those
claims into another video. Pair each candidate with a thumbnail concept; let the
image show the object, evidence, or contrast that the words cannot.

## Choose and check
Prefer the shortest wording that keeps the important distinction. Read the beginning
alone to check truncation. Check names, numbers, and implied outcomes against the
video. No unsupported “best”, invented danger, false certainty, mystery with no payoff,
or keyword chains. Curiosity is welcome; misleading the viewer is not.

Keep the approved order of candidates. Where the account offers native title or
thumbnail experiments, test distinct alternatives and interpret its reported outcome;
do not declare a winner from a small isolated click-through rate. Record approved
examples with their audience and angle. Apply my feedback here without automatically
rewriting TITLE_SHORT_FORM_VIDEOS_TASTE.md.
`,
  'TITLE_SHORT_FORM_VIDEOS_TASTE.md': `# Short-form titles

## My starting preference
A compact, concrete thought that gives this clip context immediately. The opening
frame and title should agree about what the viewer will see. Avoid introductory
phrases, empty excitement, and a title that only makes sense beside the parent video.
Use the brand's natural voice; brevity must not remove an essential qualification.

## Work from this clip
Inspect the chosen passage and its final framing. State its one complete point before
writing options. Identify the object, action, question, or result that survives the cut.
A long-form title is not automatically appropriate: an hour-long history and a single
demonstration taken from it make different promises.

Offer a few distinct angles when asked: name the surprising action, ask the question
the clip answers, or state the demonstrated result. For a clip that actually compares
flat and folded paper, “Same paper. Different folds.” is a possible direction. It
needs the visible comparison; it is not a template to apply regardless of content.
Put the identifying words early and read the title beside the first frame, the
on-screen hook, and the caption. Remove redundant wording across those surfaces.

## Keep it honest and usable
Do not tease an answer that exists only in the full video, label an excerpt “complete”,
or disguise uncertainty as a fact. Avoid generic viral/fyp filler, unrelated trends,
shouting capitals, repeated punctuation, and hashtags inserted merely to fill space.
Check the selected platform's actual title field and limit; some destinations mainly
present a caption instead. Do not assume long-form thumbnail or title test tools also
exist for Shorts.

Select for clarity and fit, then learn from comparable clips and audience feedback.
Keep examples I approve with the opening they accompanied. Never turn one successful
upload into a guaranteed formula. Changes here apply to short-form titles; preserve
TITLE_LONG_FORM_VIDEOS_TASTE.md unless I ask to change it.
`,
  'DESCRIPTION_LONG_FORM_VIDEOS_TASTE.md': `# Long-form descriptions

## My starting preference
Useful release notes for a real video, written in the channel's voice. The visible
opening should explain this video's subject and value before links or channel
boilerplate. Use the central topic words naturally. Every upload deserves its own
opening; copying the same keyword paragraph across videos is not the goal.

## Default reading order
1. Open with one or two sentences stating the question, demonstration, or takeaway
   actually covered, including an important limitation when it changes the meaning.
2. Add a short paragraph of context only when it helps: what was compared, what
   materials were used, or which part of a larger subject this video addresses.
3. Include useful resources and evidence. Say what each source supports; distinguish
   original sources from further reading. Use real, checked destinations.
4. Add verified chapters when appropriate, following YOUTUBE_SECTIONS_TASTE.md.
5. Keep relevant credits, rights information, and any applicable disclosure readable.
   Place a disclosure where needed; this reading order must not hide it below a fold.
6. Finish with one useful next step, such as a related video or reference, then any
   approved channel boilerplate. Omit sections with nothing meaningful to add.

## Editorial checks
Match claims to the final video, not an abandoned draft. Preserve names, units, dates,
qualifications, and proper attribution. Do not invent a source, working download,
sponsorship, affiliate relationship, quotation, or chapter time. Identify missing
information in the editing conversation; publishable copy must contain no unresolved
placeholders. Preview the first lines and the expanded layout on a narrow screen.

Use short paragraphs and descriptive link labels where the destination supports them.
Keep tag fields separate from prose; a list of repeated search terms is not a summary.
Preserve an approved credit format and update this guide from explicit feedback.
DESCRIPTION_SHORT_FORM_VIDEOS_TASTE.md governs captions for clips separately.
`,
  'DESCRIPTION_SHORT_FORM_VIDEOS_TASTE.md': `# Short-form descriptions

## My starting preference
A caption that earns its space by adding context. Start with the useful detail,
qualification, or observation the viewer may miss in the clip. A short caption is the
default, but use enough words for accuracy and attribution. Do not reduce a nuanced
claim to a misleading slogan merely to make it fit one line.

## A practical structure
Lead with one specific sentence, add a necessary explanation or credit, then include
an optional next step. For an experiment, the useful addition might be the material
or test condition visible only briefly. For an excerpt, identify the subject that
“this” or “they” referred to in the original. The title, opening text, and caption
should contribute different information rather than repeat the same hook three times.

Invite a response only when there is a real question worth answering. Do not default
to “comment YES”, fake urgency, or a string of commands. Add relevant visible hashtags
only when appropriate for the destination, using TAGS_SHORT_FORM_VIDEOS_TASTE.md;
do not turn the caption into unrelated labels. A branded series tag is useful only
when the series actually exists.

## Make the next step possible
Verify the destination before promising a link. YouTube Shorts description and comment
URLs are not clickable; an available related-video feature or profile destination
may be more useful. Refer to the control the viewer can actually use. Other platforms
have different capabilities, so check the selected account rather than copying the
same “link below” line everywhere.

Keep relevant source credits and disclosures visible. Never invent an attribution,
promotion, or resource. Read the finished caption with the final clip to catch missing
context, cropped evidence, or a promise the excerpt does not fulfill. Record examples
I approve and why they helped; do not automatically change the long-form description.
`,
  'THUMBNAIL_TASTE.md': `# Thumbnail taste

## The image's job
Make one honest visual idea understandable at a glance. For this faceless channel,
prefer a recognizable object, revealing detail, comparison, or visual question over
a generic reaction face. Use a clear focal hierarchy and deliberate empty space.
The title supplies part of the promise; the image should supply complementary evidence
or tension. It should still make sense when seen much smaller than the working canvas.

## Develop different concepts
Read the script, title candidates, VISUAL_IDENTITY_TASTE.md, and available assets.
When alternatives are requested, explore different compositions before polishing:
an isolated subject with a telling detail; a fair side-by-side comparison; or a
moment just before an action the video actually shows. Choose what suits this topic,
not three mandatory layouts. For a paper-bridge experiment, equal-scale structures
and the real test object communicate more than arbitrary arrows and shocked icons.

Start with the focal subject and its silhouette. Remove competing detail. Use brief
text only if it contributes a distinction the image cannot show; do not paste the
whole title onto the canvas. Make text readable over the actual background. Apply
brand colors, type, or a logo only where they improve recognition without taking
space from the story. Inspect at small mobile size and with destination overlays.

## Truth and delivery
Do not fabricate results, scale differences, quotations, endorsements, or footage.
Label an illustrative reconstruction when needed; do not pass it off as evidence.
Keep comparison conditions visually fair. Avoid decorative arrows, circles, glow,
and dramatic expressions unless they explain something specific.

Export the requested format and dimensions with descriptive filenames in the project's
thumbnail folder. Preserve the approved candidate order. Native experiments, when
available, need distinct hypotheses and the platform's own outcome context; clicks
alone do not establish that a thumbnail served viewers well. Keep approved examples
and observations here, rather than treating one successful design as universal.
`,
  'VISUAL_IDENTITY_TASTE.md': `# Visual identity

## A coherent starting direction
Clear editorial visuals with a material or graphic character appropriate to the
subject. Begin with two neutral tones and one accent, a readable text family, and
an optional contrasting display family. These are editable creative defaults, not
platform rules. The app's interface colors are not automatically this brand's colors.
An established logo, palette, type system, or user direction takes precedence.

## Make deliberate choices
Read the brand description and inspect approved assets before designing. Choose a
visual vocabulary the topic can sustain: measured diagrams for an explanation,
archival textures for a documented history, or clean material close-ups for a process.
Do not default every subject to neon gradients, floating cards, or identical stock
footage. Explain the connection between the chosen treatment and the brand's purpose.

Keep recurring roles consistent: headline, explanation, source note, caption, and
data label. Use typography with the required language coverage and available font
files; verify usage rights instead of assuming a font is free. Build spacing and
alignment around the composition's actual aspect ratio. Protect the logo's proportions
and legibility. Reuse recognizable motifs without placing a watermark over evidence.

## Readability and motion
Give text strong contrast on its real background and time to be read. Distinguish
data with labels, shapes, or patterns as well as color. Keep comparisons, units, and
chart scales honest. Motion should reveal sequence, guide attention, or explain a
relationship. Maintain a consistent rhythm and easing character; avoid flashing and
unnecessary camera movement. Check captions and important detail against real platform
overlays rather than assuming one universal safe-area margin.

## Keep the system reusable
Store reusable brand assets in shared_assets and one-video material in that video's
library. Describe visible content, intended role, palette, and known source or license
constraints in asset metadata. Edit the authoritative shared source, not a materialized
copy inside a video. Keep a few approved examples and concrete preference changes in
this guide; one-off scene directions belong in the video's script.
`,
  'TAGS_LONG_FORM_VIDEOS_TASTE.md': `# Long-form tags

## My starting preference
A small, precise vocabulary for what this video actually covers. Accuracy matters
more than filling a field. On YouTube, tags have limited discovery value compared
with the title, thumbnail, and description; genuine spelling variations can be useful.
Do not spend effort manufacturing dozens of keyword permutations.

## Select deliberately
Read the final script and approved packaging. Start with the central subject, add
specific subtopics that receive meaningful treatment, and include established names
only when they occur in the video. Use the channel's existing vocabulary when it fits.
For a paper-bridge test, “paper bridge” and “structural testing” may describe actual
coverage; unrelated engineering celebrities or every kind of bridge would not.

Prefer a natural canonical spelling. Include an alternate name, abbreviation, or
common misspelling only when it identifies the same subject and has a useful reason.
Remove duplicates and near-duplicate phrases that add nothing. A precise short list,
or no additional tags when none help, is better than manufactured completeness.

## Keep fields distinct
Store ordinary topic labels in the packaging tag list. A platform's internal tag
field is different from a visible hashtag in a caption. At publication, apply that
destination's supported syntax and current limits; do not automatically dump the tag
list into the description. Visible hashtags must still be relevant to the content.

Exclude unsupported coverage, unrelated brands, opportunistic news terms, and generic
reach claims. Do not call a label “high performing” without appropriate evidence.
Keep preferred spellings and excluded terms here as the channel develops. Evaluate
discovery in the context of the whole package; a tag change alone does not prove
causation. Short-form clips use TAGS_SHORT_FORM_VIDEOS_TASTE.md separately.
`,
  'TAGS_SHORT_FORM_VIDEOS_TASTE.md': `# Short-form tags

## My starting preference
Relevant context for this particular clip, with no automatic viral/fyp filler.
Choose terms a viewer interested in its actual subject would recognize. A short clip
usually needs fewer topic labels than its parent because it covers a narrower idea;
there is no magic hashtag count that guarantees distribution.

## Build the set from the excerpt
Inspect the final clip and its caption. Name the central subject, then a more precise
action or concept if it materially helps. Include a brand or series label only when
that identity is established. A clip showing one paper fold may justify “paper bridge”
and the relevant folding technique; it should not inherit tags for every experiment
in a longer video. Verify what an unfamiliar or ambiguous hashtag means before use.

Keep ordinary labels in the packaging tag list. Convert selected labels to visible
hashtags only where the destination supports and benefits from them; remove spaces
or adjust wording according to that platform's syntax. Do not copy internal YouTube
tags mechanically into every social caption. Leave the main caption readable and
keep qualifications and credits more prominent than promotional labels.

## Review before publishing
Reject unrelated trending sounds, celebrities, news events, and broad bait labels
that imply content the clip does not contain. Check current field limits and the
account's available creator guidance; platform features can change. Do not add tags
simply because a competitor used them, or promise extra reach from their inclusion.

Record the channel's useful recurring vocabulary and exclusions in this guide.
Compare similar clips when learning from results, remembering that topic, opening,
audience, and viewing behavior also change. Preserve TAGS_LONG_FORM_VIDEOS_TASTE.md
unless I explicitly want the preference shared across formats.
`,
  'YOUTUBE_SECTIONS_TASTE.md': `# YouTube chapters

## The navigation I want
Meaningful sections a viewer can use to find an explanation, demonstration, or answer.
Prefer descriptive, parallel headings such as “Preparing the samples” or “Comparing
the results” when those sections exist. Do not label every cut, use repetitive
“Part 1 / Part 2”, or hide useful information behind cryptic teaser language.

## Derive times from the finished video
Read the final script, then inspect the current exported video. Find real changes in
topic or task. Place a boundary where the new section becomes understandable, without
splitting a sentence from the context needed to interpret it. Script estimates and
word counts can suggest where to look; they are not verified chapter timestamps.

Manual YouTube chapters currently require the first entry at 00:00, at least three
entries in ascending order, and sections lasting at least 10 seconds. The final
section also needs that duration before the video ends. Use mm:ss, or hh:mm:ss when
needed, followed by a concise title. Do not create duplicate times or a chapter at
the very end. Check current platform requirements and account eligibility before
publication; a correctly formatted list does not guarantee the feature is available.

## Verify the list as a viewer
Seek to each boundary in the actual output and confirm the heading describes what
starts there. Check the first frame, the previous sentence, the next explanation,
and the final section's duration. Use fewer substantial sections rather than padding
the list to meet a requirement. If the video cannot support three meaningful sections
of the required length, omit chapters and explain why in the editing conversation.

Revalidate after any timing change or new export. Keep the timestamp list in this
video's release data and description, not in this preference guide. Manual chapters
replace automatic chapters on YouTube, so publish the reviewed list deliberately.
Remember useful recurring section names here only when they fit the channel's work.
`,
  'SCRIPT_LONG_FORM_VIDEOS_TASTE.md': `# Long-form script taste

## The story I want
An earned explanation or story with a clear reason to keep watching. Establish the
question, stakes, or observable result promptly, then build understanding in purposeful
sections. Match the opening to the title and thumbnail promise. Avoid long greetings,
repeated previews, unsupported certainty, and suspense that withholds a simple answer.
The right duration follows the material; there is no mandatory length or cut cadence.
Write for the ear: concrete nouns, active verbs, and one intelligible thought at a
time. Read narration aloud, vary sentence length, and leave room for an image or
pause to do work. Explain unfamiliar terms when needed without talking down to viewers.

## Write a production document
Use readable section and scene headings. For each scene, specify its purpose, the
words to be spoken if any, exact on-screen wording, visual action, asset references,
audio, and timing. Separate those fields so narration is not confused with direction.
For motion, describe what starts visible, what changes, what remains long enough to
read, and how the next scene begins. Distinguish project time from source-media in/out
points. Mark planned timings as estimates until checked against the composition and
any real recording. Silent, caption-led, or music-led work is valid when requested.

Faceless does not mean generic footage. Show evidence, comparisons, diagrams, or a
process that makes each idea easier to understand. In a hypothetical paper-bridge
experiment, show the equal test conditions before claiming the comparison is fair.
Keep sources and qualifications beside the claim they support. Name what the viewer
should notice; avoid directions such as “add an engaging visual” with no action.

## Make it implementable
Read the asset metadata and reference every asset actually used, including background
audio, with Vandashi mentions in the form @[asset name](actual asset path). Resolve
the path from the library; do not invent a plausible file. Mark unavailable material
as needed and distinguish it from existing assets. Written narration is not a claim
that a recording or voice-generation capability exists.

Read EDITS_LONG_FORM_VIDEOS_TASTE.md and the installed Hyperframes guidance when
implementing. Preserve the user's structure where possible. Update this script to
describe the final scene order, timing, media, and visuals after edits. Keep an earned
takeaway at the end and an optional relevant next step. Record reusable writing
preferences in this guide; project-specific dialogue and assets belong in script.md.
`,
  'SCRIPT_SHORT_FORM_VIDEOS_TASTE.md': `# Short-form script taste

## One complete idea
Make the subject apparent in the first visual and line, give the necessary evidence
or demonstration, and deliver a real payoff. An opening, development, and resolution
are useful defaults, not a demand to shout or use identical hooks. Start with the
interesting action or question when it is understandable without a long introduction.
The clip should reward a viewer who never watches the parent video.

## Adapt the meaning, not just the duration
Inspect the source passage and surrounding context. Replace dangling references such
as “as I said earlier” with the minimum needed identification. Keep qualifiers that
affect the claim. Do not splice speech into a different conclusion or promise an
answer that was cut away. End after the idea lands; a loop or call to action is
optional and must not conceal that the useful part is missing.

## Direct a real composition
Use compact scene beats with separate narration, on-screen words, visual action,
media mentions, audio, and timing. State the starting image, change, readable hold,
and handoff for each beat. Use the chosen 9:16 or 1:1 ratio and describe how important
evidence survives the reframe. A diagram may need to be rebuilt for the space rather
than center-cropped. Write captions for legibility; animated keywords do not replace
complete, accurate captions when those are needed for understanding.

Read asset metadata and use @[asset name](actual asset path) for every used image,
video, sound effect, and music track. Resolve existing paths; identify missing assets
honestly. Distinguish the parent's source range from the clip's local timeline, which
starts at zero. Estimate timing only until real media and playback establish it.
Do not imply a narration file exists merely because spoken words are scripted.

## Finish the standalone version
Follow EDITS_SHORT_FORM_VIDEOS_TASTE.md and the installed Hyperframes instructions.
Work inside this clip's project, keeping its script synchronized with the actual cut.
Preserve the parent unless its modification is explicitly requested. Check the first
frame, complete payoff, audible ending, and caption visibility in the intended ratio.
Keep reusable short-form preferences here without rewriting the long-form guide.
`,
  'EDITS_LONG_FORM_VIDEOS_TASTE.md': `# Long-form editing taste

## Cut for understanding
Let a clear argument or story determine the rhythm. Use a direct cut as the starting
choice; a dissolve, transition, or animated handoff should explain a change in time,
place, scale, or idea. Alternate context, detail, and evidence when the material needs
them. Hold a diagram or result long enough to inspect it. Avoid constant camera motion,
random stock footage, and decorative transitions used to cover weak explanation.

## Visual and sound decisions
Match the actual brand identity. Animate attention toward the important relationship,
then allow it to settle. Check type on the rendered frame, not just in an editor.
Keep captions clear of essential evidence and synchronized with speech; include speaker
identity or meaningful non-speech sound when needed. Word highlighting is optional,
and must not damage legibility or substitute for the complete message.

Protect speech intelligibility where speech exists. Let music support the emotional
arc, lower it around important words, and use silence deliberately. Check joins for
clipped syllables, clicks, and abrupt level changes. Place sound effects on meaningful
actions rather than every cut. Inspect the full mix on ordinary listening equipment;
do not impose a single loudness number as a universal platform requirement.

## Implement and verify
Read the installed Hyperframes entry skill and the relevant current guidance. Preserve
the existing project, media bindings, and scene identities unless the change requires
otherwise. Use framework-owned timing and seekable animation; do not introduce random
runtime behavior or independent playback clocks. Ensure the composition duration
actually includes the intended last frame and audio ending.

Run the available project checks, then inspect representative frames, transitions,
and playback with sound. Seek backward and replay to catch state that only works
on the first play. A clean lint result is not visual verification. Use Vandashi's
Preview and Render path when appropriate; if tool or browser access prevents a check,
state what remains unverified instead of claiming success. Keep script.md synchronized
with final timings and every used asset mention. Follow the project's save/commit
workflow after validation and do not change unrelated compositions.
`,
  'EDITS_SHORT_FORM_VIDEOS_TASTE.md': `# Short-form editing taste

## Immediate clarity, deliberate rhythm
Begin on an image that already communicates the subject. Remove empty lead-in and
repetition while preserving natural speech and the claim's meaning. Change the visual
when it advances the idea, reveals evidence, or redirects attention. There is no
required cut every second. Let the decisive action and payoff remain visible long
enough to understand; energy should come from the material as well as the edit.

## Reframe for the actual destination
Compose for the chosen 9:16 or 1:1 canvas. Follow the meaningful subject through the
source range; do not assume a centered crop works throughout. Redesign wide comparisons
or diagrams when shrinking them would make evidence unreadable. Check the destination's
current interface overlays and caption placement on a phone-sized preview. Keep key
details away from controls without pretending all platforms share identical margins.

Use concise readable caption groups, accurate timing, and a consistent brand style.
Preserve meaningful speech and necessary sound information; a few bouncing keywords
alone are not complete captions. Do not stack subtitles over labels needed to follow
the demonstration. Avoid flashing, constant punch-ins, and arbitrary speed changes.

## Sound, source, and completion
Keep speech intelligible over music and effects. Protect first and last syllables,
clean audio joins, and let the final sound finish deliberately. A seamless loop is an
option only when it serves the idea. Cropping, captions, borders, or speed changes do
not establish rights to someone else's footage or automatically make it original.
Use approved source material and preserve required attribution and context.

Read the installed Hyperframes guidance. Work in the clip project with a local
timeline starting at zero, keeping parent source in/out points distinct. Preserve
framework timing and media ownership. Check lint, actual playback, backward seeks,
and the exported ending in the target ratio; report checks blocked by missing tools.
Keep the clip's script and all asset mentions accurate, then follow the save/commit
workflow. Do not alter the parent project or long-form editing preferences without
an explicit request that includes them.
`,
};

export const initialScript = '';
