import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { ChatSession } from '../../../domain/models';
import type { ChatSkill } from '../../../domain/chat-skills';
import { useApp } from '../../app/store';
import type { Draft } from './session-state';
import {
  addStash,
  readStash,
  restoreStash,
  snapshotOccupied,
  writeStash,
  type ComposerSnapshot,
  type StashedPrompt,
} from './composer-stash';
import { commandItems, commandQuery, type CommandItem } from './composer-command';

interface Options {
  visible: boolean;
  session: ChatSession;
  draft: Draft;
  mode: 'read' | 'edit';
  collaboration: 'default' | 'plan';
  attachments: string[];
  locked: boolean;
  modelLocked: boolean;
  owner: RefObject<boolean>;
  setDraft: Dispatch<SetStateAction<Draft>>;
  setMode: (mode: 'read' | 'edit') => void;
  setCollaboration: (mode: 'default' | 'plan') => void;
  restoreAttachments: (paths: string[]) => void;
  clearAttachments: () => void;
  setSending: (value: boolean) => void;
  setFocusKey: Dispatch<SetStateAction<number>>;
}
export function useComposerTools(options: Options) {
  const id = useId();
  const { api, run, busy, dirty } = useApp();
  const [menu, setMenu] = useState<'commands' | 'stash' | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [skills, setSkills] = useState<ChatSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [skillFailure, setSkillFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [entries, setEntries] = useState(() => readStash(options.session.id));
  const [review, setReview] = useState<StashedPrompt | null>(null);
  const [stashFailure, setStashFailure] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [queued, setQueued] = useState(true);
  const [modelRequest, setModelRequest] = useState(0);
  const query = commandQuery(options.draft.text);
  const project = !/^(?:setup:|publish:)/u.test(options.session.topic);
  const canPlan = project && !(options.draft.handoff && options.draft.text === options.draft.seed);
  const canCompact = project && !!options.session.threadId && !busy && !dirty && !queued && !options.locked;
  const items = commandItems(skills, query?.query ?? '', query?.kind === 'skill', canPlan);
  const snapshot: ComposerSnapshot = {
    draft: options.draft,
    mode: options.mode,
    collaboration: options.collaboration,
    attachments: options.attachments,
  };
  const reviewOwner = useRef(false);
  useEffect(() => {
    if (options.visible) return;
    setMenu(null);
    setReview(null);
    if (reviewOwner.current) {
      reviewOwner.current = false;
      options.owner.current = false;
      options.setSending(false);
    }
  }, [options.visible, options.owner, options.setSending]);
  useEffect(() => {
    if (options.visible && query && dismissed !== options.draft.text && !options.locked) setMenu('commands');
    else if (!query && menu === 'commands' && dismissed !== options.draft.text) setMenu(null);
    setSelected(0);
  }, [options.draft.text, options.locked, options.visible, dismissed]);
  useEffect(() => {
    if (!options.visible || menu !== 'commands') return;
    let current = true;
    setLoading(true);
    setSkillFailure(false);
    setSkills([]);
    void api.chatSkills(options.session.id).then(
      (value) => {
        if (current) {
          setSkills(value);
          setLoading(false);
        }
      },
      () => {
        if (current) {
          setSkills([]);
          setSkillFailure(true);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [api, options.session.id, options.visible, menu, attempt]);
  useEffect(() => {
    let current = true;
    let observed = false;
    const unsubscribe = api.onEvent((event) => {
      if (event.type === 'chat-queue' && event.sessionId === options.session.id) {
        observed = true;
        setQueued(event.entries.length > 0);
      }
    });
    void api.queuedChats(options.session.id).then(
      (value) => {
        if (current && !observed) setQueued(value.length > 0);
      },
      () => {
        if (current) setQueued(true);
      },
    );
    return () => {
      current = false;
      unsubscribe();
    };
  }, [api, options.session.id]);
  const focus = () => {
    options.setFocusKey((value) => value + 1);
  };
  const close = () => {
    setMenu(null);
    setDismissed(options.draft.text);
    focus();
  };
  const disabled = (item: CommandItem) =>
    !options.visible ||
    options.locked ||
    (item.command === 'compact' && !canCompact) ||
    (item.command === 'model' && options.modelLocked);
  const choose = (item: CommandItem) => {
    if (options.owner.current || disabled(item)) return;
    if (item.command === 'compact') {
      options.owner.current = true;
      options.setSending(true);
      setCompacting(true);
      setMenu(null);
      setDismissed(options.draft.text);
      void run(async () => {
        await api.compactChat(options.session.id);
        // Consume the command only after success; failures retain the exact original draft.
        if (query) options.setDraft((value) => ({ ...value, text: query.remainder }));
      }).finally(() => {
        options.owner.current = false;
        options.setSending(false);
        setCompacting(false);
        focus();
      });
      return;
    }
    options.owner.current = true;
    try {
      let nextText = options.draft.text;
      if (item.command === 'model') {
        if (query) nextText = query.remainder;
        setModelRequest((value) => value + 1);
      } else if (item.skill)
        nextText = query
          ? `$${item.skill.name} ${query.remainder}`
          : `${nextText}${nextText && !/\s$/u.test(nextText) ? ' ' : ''}$${item.skill.name} `;
      else if (item.command) {
        options.setMode(item.command === 'edit' ? 'edit' : 'read');
        options.setCollaboration(item.command === 'plan' ? 'plan' : 'default');
        if (query) nextText = query.remainder;
      }
      options.setDraft((value) => ({ ...value, text: nextText }));
      setDismissed(nextText);
      setMenu(null);
      if (item.command !== 'model') focus();
    } finally {
      options.owner.current = false;
    }
  };
  const stash = () => {
    if (options.locked || options.owner.current || options.draft.pending || !snapshotOccupied(snapshot))
      return;
    options.owner.current = true;
    setStashFailure(false);
    try {
      addStash(options.session.id, snapshot);
      options.setDraft((value) => ({ ...value, text: '', pending: null }));
      options.clearAttachments();
      setMenu('stash');
      focus();
    } catch {
      setStashFailure(true);
      setMenu('stash');
    } finally {
      setEntries(readStash(options.session.id));
      options.owner.current = false;
    }
  };
  const restore = (entry: StashedPrompt, confirmed = false) => {
    if (
      dirty ||
      (options.locked && !reviewOwner.current) ||
      (options.owner.current && !reviewOwner.current) ||
      options.draft.pending
    )
      return;
    if (snapshotOccupied(snapshot) && !confirmed) {
      options.owner.current = true;
      reviewOwner.current = true;
      options.setSending(true);
      setReview(entry);
      setMenu(null);
      return;
    }
    options.owner.current = true;
    setStashFailure(false);
    try {
      const saved = restoreStash(options.session.id, entry.id, snapshot);
      if (!saved) return;
      options.setDraft(saved.draft);
      options.setMode(saved.mode);
      options.setCollaboration(saved.collaboration);
      options.restoreAttachments(saved.attachments);
      setReview(null);
      close();
    } catch {
      setStashFailure(true);
    } finally {
      setEntries(readStash(options.session.id));
      options.owner.current = false;
      reviewOwner.current = false;
      options.setSending(false);
    }
  };
  const remove = (entryId: string) => {
    if (options.locked || options.owner.current) return;
    options.owner.current = true;
    try {
      writeStash(
        options.session.id,
        readStash(options.session.id).filter((entry) => entry.id !== entryId),
      );
      setStashFailure(false);
    } catch {
      setStashFailure(true);
    } finally {
      setEntries(readStash(options.session.id));
      options.owner.current = false;
    }
  };
  const keyDown = (event: KeyboardEvent): boolean => {
    if (!options.visible || event.isComposing) return false;
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 's' && !event.altKey) {
      event.preventDefault();
      if (snapshotOccupied(snapshot)) stash();
      else {
        setMenu('stash');
        setDismissed(options.draft.text);
      }
      return true;
    }
    if (menu !== 'commands' || options.locked) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return true;
    }
    if (['ArrowUp', 'ArrowDown'].includes(event.key) && items.length) {
      event.preventDefault();
      setSelected((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
      return true;
    }
    if (event.key === 'Enter' && !event.shiftKey && items.length) {
      event.preventDefault();
      const item = items[Math.min(selected, items.length - 1)];
      if (item) choose(item);
      return true;
    }
    return false;
  };
  return {
    id,
    modelRequest,
    commandMenu:
      options.visible && menu === 'commands'
        ? {
            id,
            activeId: items.length
              ? [id, 'command', String(Math.min(selected, items.length - 1))].join('-')
              : null,
          }
        : null,
    menu: options.visible ? menu : null,
    items,
    selected,
    setSelected,
    skills,
    loading,
    skillFailure,
    entries,
    review: options.visible ? review : null,
    stashFailure,
    compacting,
    locked: options.locked,
    canCompact,
    canStash: !options.locked && !options.draft.pending && snapshotOccupied(snapshot) && entries.length < 20,
    openCommands: () => {
      if (!options.locked) {
        setMenu('commands');
        setDismissed(options.draft.text);
      }
    },
    openStash: () => {
      if (!options.locked) {
        setMenu('stash');
        setDismissed(options.draft.text);
      }
    },
    close,
    choose,
    disabled,
    stash,
    restore,
    remove,
    keyDown,
    retrySkills: () => {
      setAttempt((value) => value + 1);
    },
    closeReview: () => {
      setReview(null);
      if (reviewOwner.current) {
        reviewOwner.current = false;
        options.owner.current = false;
        options.setSending(false);
      }
      focus();
    },
    compact: () => {
      choose({ id: '/compact', command: 'compact' });
    },
  };
}
export type ComposerToolControls = ReturnType<typeof useComposerTools>;
