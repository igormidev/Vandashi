import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../app/store';

export function useAssetRefresh(scope: string, blocked: boolean): void {
  const { reload, run } = useApp();
  const pending = useRef(new Set<string>());
  const refresh = useCallback(() => {
    if (!scope || pending.current.has(scope)) return;
    pending.current.add(scope);
    void run(reload).finally(() => {
      pending.current.delete(scope);
    });
  }, [scope, reload, run]);
  // Entering a scope requests one snapshot. Its busy/idle transitions are not new requests.
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (blocked) return;
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
    };
  }, [blocked, refresh]);
}
