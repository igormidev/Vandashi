import { parseClipHandoff } from '../../../domain/clip-handoff';
import type { Draft } from './session-state';

export interface ComposerSnapshot {
  draft: Draft;
  mode: 'read' | 'edit';
  collaboration: 'default' | 'plan';
  attachments: string[];
}
export interface StashedPrompt extends ComposerSnapshot {
  id: string;
  createdAt: string;
}
const key = (id: string) => `vandashi.stash.${id}`;
const maximum = 20;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function readStash(sessionId: string): StashedPrompt[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(sessionId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const ids = new Set<string>();
    return raw
      .flatMap((value: unknown) => {
        if (
          !record(value) ||
          typeof value.id !== 'string' ||
          value.id.length > 200 ||
          ids.has(value.id) ||
          typeof value.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(value.createdAt)) ||
          !record(value.draft) ||
          typeof value.draft.text !== 'string' ||
          value.draft.text.length > 1_000_000 ||
          (value.draft.seed !== null && typeof value.draft.seed !== 'string') ||
          (value.draft.pending !== null && typeof value.draft.pending !== 'string') ||
          !['read', 'edit'].includes(String(value.mode)) ||
          !['default', 'plan'].includes(String(value.collaboration)) ||
          !Array.isArray(value.attachments)
        )
          return [];
        const handoff = parseClipHandoff(value.draft.handoff);
        ids.add(value.id);
        return [
          {
            id: value.id,
            createdAt: value.createdAt,
            draft: {
              text: value.draft.text,
              seed: value.draft.seed,
              pending: value.draft.pending,
              ...(handoff ? { handoff } : {}),
            },
            mode: value.mode as 'read' | 'edit',
            collaboration: handoff ? 'default' : (value.collaboration as 'default' | 'plan'),
            // Selection only: file previews and sends still require the native authority checks.
            attachments: [
              ...new Set(
                value.attachments.filter(
                  (path: unknown): path is string =>
                    typeof path === 'string' && path.length > 0 && path.length < 4096,
                ),
              ),
            ].slice(0, 50),
          },
        ];
      })
      .slice(0, maximum + 1);
  } catch {
    return [];
  }
}
export const snapshotOccupied = (value: ComposerSnapshot): boolean =>
  !!value.draft.text.trim() || !!value.draft.pending || value.attachments.length > 0;

export function writeStash(sessionId: string, entries: StashedPrompt[]): void {
  if (entries.length > maximum + 1) throw new RangeError();
  localStorage.setItem(key(sessionId), JSON.stringify(entries));
}
function saveActive(sessionId: string, value: ComposerSnapshot): void {
  localStorage.setItem(
    `vandashi.draft.${sessionId}`,
    JSON.stringify({
      ...value.draft,
      mode: value.mode,
      collaboration: value.collaboration,
      attachments: value.attachments,
    }),
  );
}
export function addStash(sessionId: string, value: ComposerSnapshot): void {
  const entries = readStash(sessionId);
  if (entries.length >= maximum) throw new RangeError();
  const next = { ...structuredClone(value), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  writeStash(sessionId, [next, ...entries]);
  // Only clear the live editor after both durable writes succeed.
  saveActive(sessionId, { ...value, draft: { ...value.draft, text: '', pending: null }, attachments: [] });
}
export function restoreStash(
  sessionId: string,
  entryId: string,
  current: ComposerSnapshot,
): StashedPrompt | null {
  const entries = readStash(sessionId);
  const selected = entries.find((entry) => entry.id === entryId);
  if (!selected) return null;
  // Save an occupied draft before replacing it. Each failure retains at least one complete copy.
  const retained = snapshotOccupied(current)
    ? [
        { ...structuredClone(current), id: crypto.randomUUID(), createdAt: new Date().toISOString() },
        ...entries,
      ]
    : entries;
  writeStash(sessionId, retained);
  saveActive(sessionId, selected);
  writeStash(
    sessionId,
    retained.filter((entry) => entry.id !== entryId),
  );
  return selected;
}
