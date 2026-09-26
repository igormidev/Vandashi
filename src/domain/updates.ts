import type { Diagnostic } from './diagnostics';

export interface UpdateRelease {
  version: string;
  notes: string[];
}
export interface UpdateState {
  revision: number;
  currentVersion: string;
  mode: 'restart' | 'installer';
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'applying' | 'unsupported';
  release: UpdateRelease | null;
  progress: number | null;
  checked: boolean;
  diagnostic: Diagnostic | null;
}
export interface UpdatePort {
  currentVersion: string;
  mode: UpdateState['mode'];
  supported: boolean;
  check: () => Promise<UpdateRelease | null>;
  download: (version: string, progress: (percent: number) => void) => Promise<void>;
  apply: (version: string) => Promise<void>;
}
export interface UpdateService {
  state(): UpdateState;
  check(): Promise<UpdateState>;
  download(version: string): Promise<UpdateState>;
  apply(version: string): Promise<UpdateState>;
}

/** Stable public releases only; prereleases never replace an installed stable build. */
export function newerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)) return null;
    const parts = value.split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  };
  const next = parse(candidate);
  const previous = parse(current);
  if (!next || !previous) return false;
  for (let index = 0; index < 3; index++) {
    const a = next[index] ?? 0;
    const b = previous[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}
