import { useEffect, useRef, useState } from 'react';
import type { Commit, Workspace } from '../../../domain/models';
import { useApp } from '../../app/store';
import { diagnosticFromBridge } from '../../../domain/diagnostics';

interface Page {
  commits: Commit[];
  hasMore: boolean;
}
export function useHistory() {
  const { workspace, api, setToast } = useApp();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Page>({ commits: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef<{ workspace: Workspace; first: Page } | null>(null);
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    const show = (value: Page) => {
      if (active) setResult(value);
    };
    const load = async () => {
      const previous = latest.current;
      const first =
        previous?.workspace === workspace
          ? previous.first
          : await api.history({ scope: workspace.scope, page: 0 });
      if (!active) return;
      latest.current = { workspace, first };
      const changed = previous && previous.first.commits[0]?.sha !== first.commits[0]?.sha;
      // Source revision intentionally omits render manifests. Git HEAD still changes for those commits.
      if (changed && page !== 0) {
        setResult(first);
        setPage(0);
        return;
      }
      const current = page === 0 ? first : await api.history({ scope: workspace.scope, page });
      show(current);
    };
    void load()
      .catch((error: unknown) => {
        if (!active) return;
        setFailed(true);
        setToast(diagnosticFromBridge(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, workspace, page, attempt, setToast]);
  return {
    ...result,
    page,
    setPage,
    loading,
    failed,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}
