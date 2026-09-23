import { join } from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import configuration from '../../electron.vite.config';
import { test as desktopTest, expect } from './fixtures';

const probeUrl = '/__vandashi_strictmode_probe__.js';
const probeId = '\0vandashi-strictmode-probe';
const probe: Plugin = {
  name: 'vandashi-strictmode-regression-probe',
  resolveId: (id) => (id === probeUrl ? probeId : undefined),
  load: (id) =>
    id === probeId
      ? `
import React from 'react';
import { createRoot } from 'react-dom/client';
export const development = import.meta.env.DEV;
export const mode = import.meta.env.MODE;
let root;
let container;
export function mount() {
  container = document.createElement('div');
  container.dataset.testid = 'strictmode-replay-proof';
  container.hidden = true;
  document.body.append(container);
  let setups = 0;
  let cleanups = 0;
  function Proof() {
    React.useEffect(() => {
      container.dataset.setups = String(++setups);
      return () => { container.dataset.cleanups = String(++cleanups); };
    }, []);
    return null;
  }
  root = createRoot(container);
  root.render(React.createElement(React.StrictMode, null, React.createElement(Proof)));
}
export function unmount() { root.unmount(); container.remove(); }
`
      : undefined,
};

/** Serve actual development React without changing the application's StrictMode or CSP. */
export const test = desktopTest.extend({
  rendererUrl: async ({ userData }, use) => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    let server: ViteDevServer | undefined;
    try {
      const renderer = configuration.renderer;
      if (!renderer) throw new Error('Renderer configuration is missing.');
      server = await createServer({
        ...renderer,
        configFile: false,
        mode: 'development',
        envFile: false,
        cacheDir: join(userData, 'vite-development-cache'),
        plugins: [...(renderer.plugins ?? []), probe],
        // Hot refresh is irrelevant here; its inline preamble would be blocked by the normal app CSP.
        server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string' || address.address !== '127.0.0.1')
        throw new Error('Development renderer must bind to an ephemeral loopback port.');
      await use(`http://127.0.0.1:${String(address.port)}/`);
    } finally {
      try {
        await server?.close();
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    }
  },
});

export { expect, probeUrl };
