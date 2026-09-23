type NavigationListener = (event: unknown, url: string, sameDocument: boolean, mainFrame: boolean) => void;
type FailureListener = (
  event: unknown,
  code: number,
  description: string,
  url: string,
  mainFrame: boolean,
) => void;

interface RendererContents {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  isDestroyed(): boolean;
  on(event: 'did-start-navigation', listener: NavigationListener): void;
  on(event: 'did-fail-load', listener: FailureListener): void;
  on(event: 'did-finish-load' | 'did-stop-loading' | 'destroyed', listener: () => void): void;
  removeListener(event: 'did-start-navigation', listener: NavigationListener): void;
  removeListener(event: 'did-fail-load', listener: FailureListener): void;
  removeListener(event: 'did-finish-load' | 'did-stop-loading' | 'destroyed', listener: () => void): void;
}

function aborted(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ERR_ABORTED' &&
    'errno' in error &&
    error.errno === -3
  );
}

/** A native Reload can supersede loadURL before the initial document finishes loading. */
export async function loadInitialRenderer(contents: RendererContents, url: string): Promise<void> {
  const state: { started: boolean; replacement: boolean; error?: Error } = {
    started: false,
    replacement: false,
  };
  let finish: (value: boolean) => void = () => undefined;
  const finished = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const onNavigation: NavigationListener = (_event, nextUrl, sameDocument, mainFrame) => {
    if (!mainFrame || sameDocument) return;
    if (state.started) {
      state.replacement = true;
      if (nextUrl !== url) finish(false);
    }
    state.started = true;
  };
  const onFailure: FailureListener = (_event, code, description, failedUrl, mainFrame) => {
    if (!state.replacement || !mainFrame) return;
    // Retain native failure information instead of converting it into a successful startup.
    if (code !== -3) {
      state.error ??= Object.assign(new Error(description), {
        errno: code,
        code: description,
        url: failedUrl,
      });
      finish(false);
    }
  };
  const onFinish = () => {
    if (state.replacement) finish(!contents.isDestroyed() && contents.getURL() === url);
  };
  const onStop = () => {
    if (state.replacement) finish(false);
  };
  const onDestroyed = () => {
    finish(false);
  };
  contents.on('did-start-navigation', onNavigation);
  contents.on('did-fail-load', onFailure);
  contents.on('did-finish-load', onFinish);
  contents.on('did-stop-loading', onStop);
  contents.on('destroyed', onDestroyed);
  try {
    await contents.loadURL(url);
  } catch (error) {
    if (!aborted(error) || !state.replacement) throw error;
    if (!(await finished) || contents.isDestroyed() || contents.getURL() !== url) throw state.error ?? error;
  } finally {
    contents.removeListener('did-start-navigation', onNavigation);
    contents.removeListener('did-fail-load', onFailure);
    contents.removeListener('did-finish-load', onFinish);
    contents.removeListener('did-stop-loading', onStop);
    contents.removeListener('destroyed', onDestroyed);
  }
}
