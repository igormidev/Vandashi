/** Runs in the isolated Studio iframe's main world; it exposes no Electron capabilities. */
function installStudioBridge(): void {
  type BridgeWindow = Window & { __vandashiStudioBridge?: { version: number; flush: () => Promise<void> } };
  const target = window as BridgeWindow;
  if (target.__vandashiStudioBridge?.version === 1) return;
  const pending = new Set<Promise<void>>();
  const failures = new Map<string, string>();
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
            failures.set(
              key,
              `Studio could not save an edit (HTTP ${String(response.status)}). Resolve the save error in the editor before leaving.`,
            );
        },
        () => {
          failures.set(
            key,
            'Studio could not save an edit. Check the local Studio connection before leaving.',
          );
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
  const drain = async () => {
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
    const failure = failures.values().next().value;
    if (failure) throw new Error(failure);
  };
  const flush = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        drain(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('Studio is still saving. Wait for its pending edits before leaving.'));
          }, 20_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  Object.defineProperty(target, '__vandashiStudioBridge', {
    value: { version: 1, flush },
    configurable: false,
    writable: false,
  });
}

function flushStudioBridge(): Promise<void> {
  const target = window as Window & { __vandashiStudioBridge?: { flush: () => Promise<void> } };
  if (!target.__vandashiStudioBridge)
    throw new Error('The Studio save connection is unavailable. Keep the editor open and retry.');
  return target.__vandashiStudioBridge.flush();
}

export const STUDIO_BRIDGE_INSTALL = `(${installStudioBridge.toString()})()`;
export const STUDIO_BRIDGE_FLUSH = `(${flushStudioBridge.toString()})()`;
