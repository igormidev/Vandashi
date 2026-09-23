import { useEffect, useRef, useState } from 'react';
import type { Commit, Workspace } from '../../../domain/models';
import { useApp } from '../../app/store';

interface Page {
  commits: Commit[];
  hasMore: boolean;
}
export function useHistory() {
  const { workspace, api, run } = useApp();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Page>({ commits: [], hasMore: false });
  const latest = useRef<{ workspace: Workspace; first: Page } | null>(null);
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    const show = (value: Page) => {
      if (active) setResult(value);
    };
    void run(async () => {
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
    });
    return () => {
      active = false;
    };
  }, [api, workspace, page, run]);
  return { ...result, page, setPage };
}
