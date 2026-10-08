import type { ElectronApplication } from '@playwright/test';
import type { ChatPromptInspection, PromptDocument } from '../../src/domain/chat-prompt';
import { installChatFixture } from './chat-fixture';
import { promptPathTokens } from '../../src/domain/prompt-references';

function document(text: string, title: string, path?: string): PromptDocument {
  return {
    id: crypto.randomUUID(),
    title,
    text,
    ...(path ? { path } : {}),
    references: promptPathTokens(text).map((token) => ({
      ...token,
      id: crypto.randomUUID(),
      label: token.value,
      readable: true,
      kind: 'guide' as const,
    })),
  };
}
export async function installPromptFixture(app: ElectronApplication) {
  const guide = '/native/My Brand/brand_identity/README.md';
  const nested = '/native/My Brand/brand_identity/docs/DETAILS.md';
  const preview = document(
    'COMPLETE APP GUIDANCE\nRead ' + JSON.stringify(guide) + '.\n\nEnd of the complete prompt.',
    'brand',
  );
  const first = document(
    '# README\nWhole creative guidance. Read [details](docs/DETAILS.md).\n<script>window.promptExecuted=true</script>\nEND OF README',
    'README.md',
    guide,
  );
  const second = document('# Details\nRead `../README.md`.\nEND OF NESTED FILE', 'DETAILS.md', nested);
  const saved = document('EXACT HISTORICAL GUIDANCE\nRead ' + JSON.stringify(guide), 'brand');
  const developer = document('Captured developer instructions.', 'brand');
  const inspection: ChatPromptInspection = {
    id: crypto.randomUUID(),
    preview,
    developerTemplate: document('CURRENT THREAD TEMPLATE', 'brand'),
    snapshots: [{ messageId: 'saved-request', createdAt: '2026-10-08T10:00:00Z', hasDeveloper: true }],
    mode: 'edit',
    collaboration: 'default',
    hasLegacyMessages: true,
    skillsAvailable: true,
  };
  await app.evaluate(
    ({ ipcMain }, fixture) => {
      const original = ipcMain.handle.bind(ipcMain);
      let hold = false;
      let fail = false;
      let requests: { method: string; input: unknown }[] = [];
      const pending: (() => void)[] = [];
      ipcMain.on(
        'vandashi:prompt-control',
        (_event, control: { hold?: boolean; fail?: boolean; clear?: boolean; skillsAvailable?: boolean }) => {
          if (control.hold !== undefined) hold = control.hold;
          if (control.fail !== undefined) fail = control.fail;
          if (control.clear) requests = [];
          if (control.skillsAvailable !== undefined)
            fixture.inspection.skillsAvailable = control.skillsAvailable;
          if (!hold) for (const complete of pending.splice(0)) complete();
        },
      );
      ipcMain.on('vandashi:prompt-requests', (_event, reply: (value: typeof requests) => void) => {
        reply(requests);
      });
      ipcMain.handle = (channel, listener) => {
        original(channel, (event, method: string, args: unknown[]) => {
          if (!['chatPrompt', 'chatPromptDocument', 'chatPromptSource'].includes(method))
            return listener(event, method, args) as unknown;
          const input = args[0];
          requests.push({ method, input });
          const result = () => {
            if (fail) throw new Error('Readable fixture failure; retry preserves the current document.');
            if (method === 'chatPrompt') return fixture.inspection;
            if (method === 'chatPromptSource')
              return (input as { developer: boolean }).developer ? fixture.developer : fixture.saved;
            const reference = (input as { referenceId: string }).referenceId;
            return reference === fixture.first.references[0]?.id ? fixture.second : fixture.first;
          };
          if (hold)
            return new Promise((resolve, reject) => {
              pending.push(() => {
                try {
                  resolve(result());
                } catch (error) {
                  reject(error instanceof Error ? error : new Error(String(error)));
                }
              });
            });
          return result();
        });
      };
      ipcMain.once('vandashi:prompt-restore-handler', () => {
        ipcMain.handle = original;
      });
    },
    { inspection, first, second, saved, developer },
  );
  await installChatFixture(app, false);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:prompt-restore-handler');
  });
}
export const promptControl = (
  app: ElectronApplication,
  control: { hold?: boolean; fail?: boolean; clear?: boolean; skillsAvailable?: boolean },
) =>
  app.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:prompt-control', {}, value);
  }, control);
export const promptRequests = (app: ElectronApplication): Promise<{ method: string; input: unknown }[]> =>
  app.evaluate(
    ({ ipcMain }) =>
      new Promise((resolve) => {
        ipcMain.emit('vandashi:prompt-requests', {}, resolve);
      }),
  );
