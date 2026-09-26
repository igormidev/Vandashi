import { ipcMain } from 'electron';
import { pathToFileURL } from 'node:url';

// UI fixtures replace the managed multi-gigabyte model installation. Runtime integration
// has its own real test. Keep this injection entirely outside the production application.
const handle = ipcMain.handle.bind(ipcMain);
let initial = true;
ipcMain.handle = (channel, listener) => {
  if (channel === 'vandashi:invoke' && initial) {
    initial = false;
    return handle(channel, (event, method, args) => {
      if (method === 'prepareTranscriptions') return { status: 'ready' };
      if (method === 'prepareTranscriptionModel') return undefined;
      return listener(event, method, args);
    });
  }
  return handle(channel, listener);
};
await import(pathToFileURL(process.argv[2]).href);
