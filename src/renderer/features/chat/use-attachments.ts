import { useMemo, useState, type RefObject } from 'react';
import { assetKind } from '../../../domain/asset-kind';
import { AppFault } from '../../../domain/diagnostics';
import { useApp } from '../../app/store';
import { mentionedPaths, referenceText, removeMention } from './mention-document';
import type { MentionReference } from './mention-references';

export function attachmentReference(path: string): MentionReference {
  return { path, name: path.split(/[\\/]/u).at(-1) ?? '', kind: assetKind(path) };
}

export function useAttachments(
  text: string,
  setText: (value: string) => void,
  locked: boolean,
  owner: RefObject<boolean>,
  initial: string[] = [],
) {
  const { api, run } = useApp();
  const [storedPaths, setPaths] = useState<string[]>(initial);
  const paths = useMemo(
    () => storedPaths.filter((path) => mentionedPaths(text).includes(path)),
    [storedPaths, text],
  );
  const [picking, setPicking] = useState(false);
  const add = (added: string[]) => {
    const next = [...new Set([...paths, ...added])].slice(0, 50);
    setPaths(next);
    const tokens = added
      .filter((path) => next.includes(path))
      .map((path) => referenceText(attachmentReference(path)))
      .filter((token) => !text.includes(token));
    if (tokens.length) setText(`${text}${text && !/\s$/u.test(text) ? ' ' : ''}${tokens.join(' ')} `);
  };
  const select = () => {
    if (locked || picking || owner.current) return;
    owner.current = true;
    setPicking(true);
    void run(async () => {
      add(await api.chooseFiles('assets'));
    }).finally(() => {
      owner.current = false;
      setPicking(false);
    });
  };
  const paste = (files: File[]) => {
    if (locked || picking || owner.current) return;
    owner.current = true;
    setPicking(true);
    void run(async () => {
      const added: string[] = [];
      for (const file of files.slice(0, 50 - paths.length)) {
        const physical = api.pathForFile(file);
        if (physical) {
          added.push(physical);
          continue;
        }
        if (!file.type.startsWith('image/') || file.size > 4_000_000)
          throw new AppFault({ id: 'desktopPreviewInvalid' });
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 16_384)
          binary += String.fromCharCode(...bytes.subarray(index, index + 16_384));
        added.push(await api.storePastedImage(btoa(binary)));
      }
      add(added);
    }).finally(() => {
      owner.current = false;
      setPicking(false);
    });
  };
  return {
    paths,
    picking,
    select,
    paste,
    changed: (value: string) => {
      if (locked || owner.current) return;
      setPaths((current) => current.filter((path) => mentionedPaths(value).includes(path)));
      setText(value);
    },
    remove: (path: string) => {
      if (!locked && !owner.current) {
        setPaths((current) => current.filter((entry) => entry !== path));
        setText(removeMention(text, path));
      }
    },
    clear: () => {
      setPaths([]);
    },
    restore: (restored: string[]) => {
      setPaths(restored);
    },
  };
}
