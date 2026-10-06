import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
export function InspectorSplit({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { state, api, run, refresh } = useApp();
  const [ratio, setRatio] = useState(state?.settings.splits.assetInspector ?? 35);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);
  const actual = width > 560 ? Math.max(265, Math.min(width - 225, (width * ratio) / 100)) : null;
  const saves = useRef(Promise.resolve());
  const persist = () => {
    saves.current = saves.current.then(async () => {
      await run(async () => {
        const latest = (await api.getState()).settings;
        await api.settings({ ...latest, splits: { ...latest.splits, assetInspector: ratio } });
        await refresh();
      });
    });
  };
  return (
    <div
      className="asset-workspace"
      ref={container}
      style={{
        gridTemplateColumns: `minmax(220px, 1fr) 5px ${actual === null ? `minmax(265px, ${String(ratio)}%)` : `${String(actual)}px`}`,
      }}
    >
      {children}
      <button
        type="button"
        className="split-handle inspector-handle"
        role="slider"
        aria-label={t('resizePanels')}
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={ratio}
        aria-orientation="horizontal"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            setRatio(Math.max(25, Math.min(75, ratio + (event.key === 'ArrowLeft' ? 2 : -2))));
          }
        }}
        onBlur={persist}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !container.current) return;
          const box = container.current.getBoundingClientRect();
          setRatio(Math.max(25, Math.min(75, ((box.right - event.clientX) / box.width) * 100)));
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          persist();
        }}
      />
    </div>
  );
}
