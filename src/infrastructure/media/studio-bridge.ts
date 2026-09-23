import type { Diagnostic } from '../../domain/diagnostics';
export type StudioFlushResult = { ok: true } | { ok: false; diagnostic: Diagnostic };

/** Runs in the isolated Studio iframe's main world; it exposes no Electron capabilities. */
function installStudioBridge(): void {
  type BridgeWindow = Window & {
    __vandashiStudioBridge?: { version: number; flush: () => Promise<StudioFlushResult> };
  };
  const target = window as BridgeWindow;
  if (target.__vandashiStudioBridge?.version === 2) return;
  const pending = new Set<Promise<void>>();
  const failures = new Map<string, Diagnostic>();
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const route = /^\/api\/projects\/[^/]+\/(.+)$/u.exec(url.pathname)?.[1] ?? '';
    // Pinned Hyperframes source mutation routes. Render, selection and probe requests are not saves.
    const fileWrite = method === 'PUT' && route.startsWith('files/');
    const mutation =
      (route.startsWith('files/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) ||
      (method === 'POST' &&
        (/^(?:file-mutations\/(?!probe-element\/)|gsap-mutations\/|gsap-mutations-batch\/|gsap-mutation-rollback\/)/u.test(
          route,
        ) ||
          ['upload', 'duplicate-file', 'registry/install'].includes(route)));
    // Clone before fetch can consume a Request body. Never consume the vendor's original body/response.
    const attempted =
      fileWrite && typeof init?.body === 'string'
        ? Promise.resolve(init.body)
        : fileWrite && init?.body === undefined && input instanceof Request
          ? input
              .clone()
              .text()
              .catch(() => undefined)
          : Promise.resolve(undefined);
    const request = originalFetch(input, init);
    if (url.origin === window.location.origin && mutation) {
      const key = `${method} ${url.pathname}`;
      const tracked = request.then(
        async (response) => {
          let saved = response.ok;
          if (fileWrite && response.status === 409) {
            try {
              const conflict: unknown = await response.clone().json();
              // useStudioProjectFiles in Hyperframes 0.8.64 accepts exactly this already-written result.
              saved =
                typeof conflict === 'object' &&
                conflict !== null &&
                'currentVersion' in conflict &&
                Boolean(conflict.currentVersion) &&
                'currentContent' in conflict &&
                typeof conflict.currentContent === 'string' &&
                conflict.currentContent === (await attempted);
            } catch {
              saved = false;
            }
          }
          if (saved) failures.delete(key);
          else
            failures.set(key, {
              kind: 'app',
              message: { id: 'mediaBridgeSaveHttp', params: { status: response.status } },
            });
        },
        () => {
          failures.set(key, { kind: 'app', message: { id: 'mediaBridgeSaveConnection' } });
        },
      );
      pending.add(tracked);
      void tracked.finally(() => {
        pending.delete(tracked);
      });
    }
    return request;
  };
  const tick = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  const drain = async (): Promise<Diagnostic | null> => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.matches('input,textarea,select,[contenteditable="true"],[role="textbox"]')
    ) {
      active.blur();
      await tick();
    }
    // This is the pinned vendor's public pending-edit event, also used by its own render action.
    const detail: { promises: Promise<unknown>[] } = { promises: [] };
    window.dispatchEvent(new CustomEvent('hf-studio-flush-pending-edits', { detail }));
    let quiet = 0;
    while (quiet < 2) {
      const work = [...detail.promises, ...pending];
      detail.promises = [];
      if (work.length) {
        quiet = 0;
        await Promise.all(work);
      } else quiet += 1;
      await tick();
    }
    return failures.values().next().value ?? null;
  };
  const flush = async (): Promise<StudioFlushResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const diagnostic = await Promise.race([
        drain(),
        new Promise<Diagnostic>((resolve) => {
          timer = setTimeout(() => {
            resolve({ kind: 'app', message: { id: 'mediaBridgePending' } });
          }, 20_000);
        }),
      ]);
      return diagnostic ? { ok: false, diagnostic } : { ok: true };
    } catch (error) {
      const text =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : String(error);
      return { ok: false, diagnostic: { kind: 'external', text: text.slice(0, 32_768) } };
    } finally {
      clearTimeout(timer);
    }
  };
  Object.defineProperty(target, '__vandashiStudioBridge', {
    value: { version: 2, flush },
    configurable: false,
    writable: false,
  });
}

function flushStudioBridge(): Promise<StudioFlushResult> {
  const target = window as Window & { __vandashiStudioBridge?: { flush: () => Promise<StudioFlushResult> } };
  if (!target.__vandashiStudioBridge)
    return Promise.resolve({
      ok: false,
      diagnostic: { kind: 'app', message: { id: 'mediaBridgeUnavailable' } },
    });
  return target.__vandashiStudioBridge.flush();
}
export const STUDIO_BRIDGE_INSTALL = `(${installStudioBridge.toString()})()`;
export const STUDIO_BRIDGE_FLUSH = `(${flushStudioBridge.toString()})()`;
