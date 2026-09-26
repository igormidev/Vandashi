import type { ElectronApplication } from '@playwright/test';
import type { DesktopApi } from '../../src/domain/api';
import type { AppState, ChatSession, Settings } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';

export type ModalOperation = 'undoChat' | 'resetChat' | 'createBrand' | 'createVideo';
interface ModalStatus {
  pending: ModalOperation | null;
  requests: { method: ModalOperation; input: unknown }[];
}

export async function installModalOperationsFixture(
  desktop: ElectronApplication,
  home = false,
): Promise<void> {
  await desktop.evaluate(
    ({ ipcMain }, fixture) => {
      let workspace = fixture.workspace;
      let state: AppState = fixture.home
        ? { ...fixture.state, brands: [], lastBrandId: null }
        : fixture.state;
      const initial = fixture.sessions[0];
      if (!initial) throw new Error('Missing fixture conversation.');
      const message = initial.messages[0];
      if (!message) throw new Error('Missing fixture message.');
      let session: ChatSession = {
        ...initial,
        messages: [
          { ...message, id: 'earlier', text: 'Earlier retained answer' },
          { ...message, id: 'latest', text: 'Latest answer to remove' },
        ],
        checkpoints: [{ turnId: 't1', threadId: 'thread-one', heads: {}, messageCount: 1 }],
      };
      const requests: ModalStatus['requests'] = [];
      let pending: {
        method: ModalOperation;
        complete: () => unknown;
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
      } | null = null;
      const waitForOperation = (method: ModalOperation, input: unknown, complete: () => unknown) => {
        requests.push({ method, input });
        if (pending) throw new Error('Duplicate modal operation.');
        return new Promise<unknown>((resolve, reject) => {
          pending = { method, complete, resolve, reject };
        });
      };
      ipcMain.on('vandashi:modal-finish', (_event, outcome: 'success' | 'failure') => {
        if (!pending) throw new Error('No pending modal operation.');
        const operation = pending;
        pending = null;
        if (outcome === 'failure') operation.reject(new Error('The operation failed; please retry.'));
        else operation.resolve(operation.complete());
      });
      ipcMain.on('vandashi:modal-status', (_event, reply: (status: ModalStatus) => void) => {
        reply({ pending: pending?.method ?? null, requests });
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        if (method === 'getUpdateState')
          return {
            revision: 0,
            currentVersion: '0.1.2',
            mode: 'installer',
            phase: 'unsupported',
            release: null,
            progress: null,
            checked: false,
            diagnostic: null,
          };
        if (method === 'getState') return state;
        if (method === 'models') return fixture.models;
        if (method === 'settings') {
          state = { ...state, settings: input as Settings };
          return;
        }
        if (method === 'openBrand' || method === 'openWorkspace') return workspace;
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'sessions') return workspace.scope.videoId ? [] : [session];
        if (method === 'listVideos') return workspace.video ? [workspace.video] : [];
        if (method === 'chooseDirectory') return '/tmp/modal-brand-parent';
        if (method === 'undoChat' || method === 'resetChat')
          return waitForOperation(method, input, () => {
            session = {
              ...session,
              messages: method === 'undoChat' ? session.messages.slice(0, 1) : [],
              checkpoints: [],
              threadId: method === 'undoChat' ? 'forked-thread' : null,
            };
            return session;
          });
        if (method === 'createBrand') {
          const request = input as Parameters<DesktopApi['createBrand']>[0];
          return waitForOperation(method, input, () => {
            const brand = {
              ...workspace.brand,
              name: request.name,
              path: `${request.parentPath}/${request.name}`,
              config: { ...workspace.brand.config, name: request.name },
            };
            workspace = { ...workspace, brand };
            state = { ...state, brands: [brand], lastBrandId: brand.id };
            return brand;
          });
        }
        if (method === 'createVideo') {
          const request = input as Parameters<DesktopApi['createVideo']>[0];
          return waitForOperation(method, input, () => {
            const template = fixture.video;
            if (!template) throw new Error('Missing video fixture.');
            const video = { ...template, name: request.name, ratio: request.ratio };
            workspace = {
              ...workspace,
              scope: { ...workspace.scope, videoId: video.id },
              video,
              revision: 'created-video',
            };
            return workspace;
          });
        }
        throw new Error(`Unexpected modal fixture method: ${method}`);
      });
    },
    { ...chatFixtureData(false, {}), video: chatFixtureData(true, {}).workspace.video, home },
  );
}

export async function finishModalOperation(
  desktop: ElectronApplication,
  outcome: 'success' | 'failure',
): Promise<void> {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:modal-finish', undefined, value);
  }, outcome);
}

export function modalOperationStatus(desktop: ElectronApplication): Promise<ModalStatus> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<ModalStatus>((resolve) => {
        ipcMain.emit('vandashi:modal-status', undefined, resolve);
      }),
  );
}
