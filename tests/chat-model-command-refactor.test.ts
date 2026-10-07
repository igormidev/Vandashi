import { expect, it } from 'vitest';
import { commandItems, commandQuery } from '../src/renderer/features/chat/composer-command';

it('offers model selection independently of Plan permission and retains the complete draft remainder', () => {
  const text = '/model Keep these exact lines\n\n  and spaces';
  const query = commandQuery(text);
  expect(query?.remainder).toBe('Keep these exact lines\n\n  and spaces');
  for (const canPlan of [false, true]) {
    const items = commandItems([], query?.query ?? '', false, canPlan);
    expect(items).toHaveLength(1);
    expect(items[0]?.command).toBe('model');
  }
  expect(commandItems([], 'model', true, true)).toEqual([]);
  expect(commandQuery('A quoted /model request')).toBeNull();
});
