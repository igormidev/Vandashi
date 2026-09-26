import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateState } from '../../../domain/updates';
import { useApp } from '../../app/store';

export function useUpdates() {
  const { api, run } = useApp();
  const [state, setState] = useState<UpdateState | null>(null);
  const [working, setWorking] = useState(false);
  const owner = useRef(false);
  const adopt = useCallback((next: UpdateState) => {
    setState((current) => (!current || next.revision >= current.revision ? next : current));
  }, []);
  useEffect(() => {
    let current = true;
    const unsubscribe = api.onEvent((event) => {
      if (event.type === 'update') adopt(event.state);
    });
    void run(async () => {
      const initial = await api.getUpdateState();
      if (current) adopt(initial);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [api, adopt, run]);
  const execute = async (action: () => Promise<UpdateState>) => {
    if (owner.current) return;
    owner.current = true;
    setWorking(true);
    try {
      await run(async () => {
        adopt(await action());
      });
    } finally {
      owner.current = false;
      setWorking(false);
    }
  };
  return {
    state,
    working,
    check: () => execute(() => api.checkForUpdates()),
    download: (version: string) => execute(() => api.downloadUpdate(version)),
    apply: (version: string) => execute(() => api.applyUpdate(version)),
  };
}
export type UpdateControl = ReturnType<typeof useUpdates>;
