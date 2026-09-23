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
    const request = originalFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith('/api/projects/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ) {
      const key = `${method} ${url.pathname}`;
      const tracked = request.then(
        (response) => {
          if (response.ok) failures.delete(key);
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
