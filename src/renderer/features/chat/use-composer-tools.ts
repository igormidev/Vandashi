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
import { acceptsCommandKey, commandItems, type CommandItem } from './composer-command';
import type { CommandSuggestion } from './command-suggestion';

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
  const { api, dirty } = useApp();
  const [menu, setMenu] = useState<'commands' | 'stash' | null>(null);
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [skills, setSkills] = useState<ChatSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [skillFailure, setSkillFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [entries, setEntries] = useState(() => readStash(options.session.id));
  const [review, setReview] = useState<StashedPrompt | null>(null);
  const [stashFailure, setStashFailure] = useState(false);
  const [modelRequest, setModelRequest] = useState(0);
  const project = !/^(?:setup:|publish:)/u.test(options.session.topic);
  const canPlan = project && !(options.draft.handoff && options.draft.text === options.draft.seed);
  const items = commandItems(skills, suggestion?.query ?? '', false, canPlan);
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
    if (!options.visible || options.locked) {
      setMenu(null);
      suggestion?.close();
    } else if (suggestion) setMenu('commands');
    else setMenu((current) => (current === 'commands' ? null : current));
    setSelected(0);
  }, [suggestion, options.locked, options.visible]);
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
  const focus = () => {
    options.setFocusKey((value) => value + 1);
  };
  const close = (refocus = true) => {
    setMenu(null);
    suggestion?.close();
    if (refocus) {
      if (suggestion) suggestion.focus();
      else focus();
    }
  };
  const disabled = (item: CommandItem) =>
    !options.visible ||
    options.locked ||
    (item.command === 'model' && options.modelLocked) ||
    (item.command === 'stash' &&
      ((!suggestion?.preview('')?.trim() && !options.attachments.length) ||
        !!options.draft.pending ||
        entries.length >= 20));
  const stash = (source = snapshot) => {
    if (options.locked || options.owner.current || options.draft.pending || !snapshotOccupied(source)) return;
    options.owner.current = true;
    setStashFailure(false);
    try {
      addStash(options.session.id, source);
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
  const choose = (item: CommandItem) => {
    if (options.owner.current || disabled(item) || !suggestion) return;
    if (item.command === 'stash') {
      const text = suggestion.preview('');
      if (text === null) return;
      stash({ ...snapshot, draft: { ...options.draft, text } });
      suggestion.close();
      return;
    }
    options.owner.current = true;
    try {
      const text = suggestion.apply(item.skill ? '$' + item.skill.name + ' ' : '');
      if (text === null) return;
      options.setDraft((current) => ({ ...current, text }));
      setMenu(item.command === 'restore' ? 'stash' : null);
      if (item.command === 'model') setModelRequest((value) => value + 1);
      else if (item.command === 'plan' || item.command === 'read' || item.command === 'edit') {
        options.setMode(item.command === 'edit' ? 'edit' : 'read');
        options.setCollaboration(item.command === 'plan' ? 'plan' : 'default');
      }
    } finally {
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
    if (acceptsCommandKey(event) && items.length) {
      event.preventDefault();
      const item = items[Math.min(selected, items.length - 1)];
      if (item) choose(item);
      return true;
    }
    return false;
  };
  return {
    id,
    onSuggestion: setSuggestion,
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
    locked: options.locked,
    canStash: !options.locked && !options.draft.pending && snapshotOccupied(snapshot) && entries.length < 20,
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
  };
}
export type ComposerToolControls = ReturnType<typeof useComposerTools>;
