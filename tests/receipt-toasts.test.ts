import { expect, it } from 'vitest';
import type { AppEvent } from '../src/domain/models';
import { ReceiptToasts } from '../src/renderer/app/receipt-toasts';

const saved: Extract<AppEvent, { type: 'chat' }> = {
  type: 'chat',
  sessionId: 'conversation',
  delta: false,
  message: {
    id: 'receipt:thread:turn',
    role: 'tool',
    text: 'The provider text does not determine the toast.',
    appMessage: { id: 'turnSaved' },
    turnId: 'turn',
    files: [{ path: '/project/script.md', additions: 1, deletions: 0, diff: '+Opening' }],
    createdAt: '',
  },
};

it('uses the verified receipt descriptor once despite duplicate subscriptions or replay', () => {
  const notifications = new ReceiptToasts();
  expect(notifications.consume({ ...saved, delta: true })).toBeNull();
  expect(notifications.consume(saved)).toEqual({ id: 'turnSaved' });
  expect(notifications.consume(structuredClone(saved))).toBeNull();
  expect(notifications.consume({ ...saved, sessionId: 'other-conversation' })).toEqual({ id: 'turnSaved' });
});

it('never infers saved changes from task completion, helpers, failure, or provider prose', () => {
  const notifications = new ReceiptToasts();
  const events: AppEvent[] = [
    { type: 'activity', activity: { sessionId: 'conversation', phase: 'done', detail: 'Changes saved.' } },
    { type: 'activity', activity: { sessionId: 'commit-helper', phase: 'done', detail: '' } },
    { type: 'activity', activity: { sessionId: 'conversation', phase: 'error', detail: '' } },
    {
      ...saved,
      message: { ...saved.message, role: 'assistant', text: 'Changes saved.' },
    },
    {
      ...saved,
      message: { ...saved.message, role: 'error' },
    },
    {
      ...saved,
      message: { ...saved.message, appMessage: { id: 'turnUnchanged' }, files: [] },
    },
    { ...saved, message: { ...saved.message, files: [] } },
    { ...saved, message: { ...saved.message, turnId: null } },
    { ...saved, message: { ...saved.message, id: 'provider-item' } },
    { ...saved, message: { ...saved.message, diagnostic: { kind: 'external', text: 'Save failed' } } },
  ];
  expect(events.map((event) => notifications.consume(event))).toEqual(events.map(() => null));
  expect(notifications.consume(saved)).toEqual({ id: 'turnSaved' });
});
