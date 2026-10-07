import { test, expect } from './development-fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl } from './chat-fixture';
import type { ChatMessage } from '../../src/domain/models';

function answer(text: string, streaming = false): ChatMessage {
  return { id: 'code-answer', role: 'assistant', text, turnId: 'turn', files: [], createdAt: '', streaming };
}

test('native chat syntax highlighting uses colored text tokens and preserves literal HTML source safely', async ({
  desktopApp,
  page,
}) => {
  const source = 'const markup = "<img src=x onerror=evil()>";\n';
  await installChatRefactorFixture(desktopApp, { initialMessages: [answer(`\`\`\`ts\n${source}\`\`\``)] });
  await page.reload();
  const wasm = await page.evaluate(async () => {
    try {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      return true;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(wasm).toBe(true);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).not.toContain("'unsafe-eval'");
  const code = page.locator('.chat-code pre code');
  await expect(code).toHaveText(source);
  await expect.poll(() => code.locator('span[style]').count()).toBeGreaterThan(2);
  await expect(code.locator('img')).toHaveCount(0);
});

test('Mermaid stays source during streaming and renders strict local SVG with inspectable source after settlement', async ({
  desktopApp,
  page,
}) => {
  const source =
    'flowchart TD\n A[Read guides] --> B[Edit script]\n click A "https://untrusted.invalid/" "External"';
  const markdown = `\`\`\`mermaid\n${source}\n\`\`\``;
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('untrusted.invalid')) external.push(request.url());
  });
  await installChatRefactorFixture(desktopApp, { initialMessages: [answer(markdown, true)] });
  await page.reload();
  await expect(page.locator('.chat-code pre code')).toContainText('flowchart TD');
  await expect(page.getByRole('img', { name: 'Diagram', exact: true })).toHaveCount(0);
  await chatControl(desktopApp, {
    event: { type: 'chat', sessionId: 'chat-one', delta: false, message: answer(markdown) },
  });
  const diagram = page.getByRole('img', { name: 'Diagram', exact: true });
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram).toContainText('Read guides');
  await expect(diagram.locator('a,img,image,script,foreignObject,[href],[xlink\\:href]')).toHaveCount(0);
  expect(external).toEqual([]);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('.chat-code pre code')).toContainText(source);
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(diagram.locator('svg')).toBeVisible();
});

test('invalid or resource-bearing Mermaid keeps the exact source without remote fetches', async ({
  desktopApp,
  page,
}) => {
  const source = 'flowchart TD\n A@{ img: "https://untrusted.invalid/tracker.png" }';
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('untrusted.invalid')) external.push(request.url());
  });
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [answer(`\`\`\`mermaid\n${source}\n\`\`\``)],
  });
  await page.reload();
  await expect(page.locator('.chat-diagram-failure')).toContainText('The source is available below.');
  await expect(page.locator('.chat-diagram-failure pre')).toContainText(source);
  await expect(page.locator('.chat-diagram svg')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('completed spawn tools preserve active child status and show historical provider snapshots honestly', async ({
  desktopApp,
  page,
}) => {
  const spawn: ChatMessage = {
    id: 'spawn-tool',
    role: 'tool',
    text: 'Review the guide',
    files: [],
    createdAt: '',
    turnId: 'turn',
    streaming: false,
    activity: {
      kind: 'agent',
      status: 'completed',
      title: 'spawnAgent',
      agents: [{ id: 'child', name: 'Reviewer', status: 'inProgress', result: '' }],
    },
  };
  await installChatRefactorFixture(desktopApp, { initialMessages: [spawn] });
  await page.reload();
  const work = page.locator('.chat-work-log');
  await expect(work.locator('.chat-work-heading')).toBeVisible();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  await expect(work).toHaveClass(/is-live/);
  const row = work.locator('.chat-work-row');
  await expect(row.getByLabel('Completed', { exact: true })).toBeVisible();
  await row.click();
  const status = work.locator('.chat-agent-status');
  await expect(status).toHaveText('Working');
  await expect(status.locator('.spin')).toHaveCount(1);
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'done', detail: '' } },
  });
  await work.locator('.chat-work-heading').click();
  await row.click();
  await expect(status).toHaveText('Last reported: Working');
  await expect(status.locator('.spin')).toHaveCount(0);
  await expect(status).not.toContainText('Interrupted');
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        ...spawn,
        id: 'wait-tool',
        activity: {
          kind: 'agent',
          status: 'completed',
          title: 'wait',
          agents: [{ id: 'child', name: 'Reviewer', status: 'completed', result: 'The guide is valid.' }],
        },
      },
    },
  });
  await expect(work).not.toHaveClass(/is-live/);
  await expect(status).toHaveText('Completed');
  await expect(work.locator('.chat-agent')).toContainText('The guide is valid.');
});
