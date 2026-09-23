import type { DesktopApi } from '../domain/api';
declare global {
  interface Window {
    vandashi?: DesktopApi;
  }
}
