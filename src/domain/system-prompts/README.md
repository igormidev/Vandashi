# Vandashi system prompts

This is the reviewable source for application guidance sent to Codex. Provider output,
user messages and creator-owned taste guides are separate content.

- `workspace.ts`: topic selection, required context, repository paths and creative rules.
- `setup.ts`: allowlisted host installation topics and bounded setup guidance.
- `provider.ts`: creative/installation thread developer instructions.
- Numbered Markdown templates: commit suggestions, automation, publishing, Studio
  synchronization, publication scope, transcription instructions and bundled CLI context.
- `skills/`: the three managed asset/preset skills installed in Vandashi's isolated Codex home.

Markdown templates mark dynamic fields with `{{namedParameter}}`. Their caller supplies
every named field. Substitution happens once, so braces in user content remain literal.
The TypeScript builders show dynamic context through explicit input properties and
template interpolations. Edit these sources; generated transcription guides and installed
skill copies are refreshed by the app and must not be edited as the source of truth.

Creative chats can write registered repositories and their exact owned generation stage.
They do not receive global filesystem or installation authority. Ordinary asset libraries
receive final outputs and metadata; a preset may additionally contain the explicitly
permitted small Hyperframes demo project. Both use the same transcription pipeline.
