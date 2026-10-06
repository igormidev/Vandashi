import template1 from './commits-1.md?raw';
import template2 from './automation-2.md?raw';
import template3 from './publishing-3.md?raw';
import template4 from './publishing-4.md?raw';
import template5 from './studio-5.md?raw';
import template6 from './publish-scope-6.md?raw';
import template7 from './transcription-7.md?raw';
import template8 from './hyperframes-8.md?raw';
import { AppFault } from '../diagnostics';

const templates = {
  'commits-1': template1,
  'automation-2': template2,
  'publishing-3': template3,
  'publishing-4': template4,
  'studio-5': template5,
  'publish-scope-6': template6,
  'transcription-7': template7,
  'hyperframes-8': template8,
} as const;
/** Substitute in one pass: user text containing placeholders is never interpreted. */
export function renderSystemPrompt(id: keyof typeof templates, values: Record<string, string>): string {
  return templates[id].replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new AppFault({ id: 'desktopArgumentsInvalid' });
    return String(values[key]);
  });
}
