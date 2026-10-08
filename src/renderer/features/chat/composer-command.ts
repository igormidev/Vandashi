import type { ChatSkill } from '../../../domain/chat-skills';

export type ComposerCommand = 'plan' | 'read' | 'edit' | 'model' | 'stash' | 'restore';
export interface CommandItem {
  key: string;
  id: string;
  command?: ComposerCommand;
  skill?: ChatSkill;
}
export function acceptsCommandKey(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): boolean {
  return (
    (event.key === 'Enter' && !event.shiftKey) ||
    (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey)
  );
}
export function commandQuery(
  text: string,
): { kind: 'command' | 'skill'; query: string; remainder: string } | null {
  const match = /^([/$])([^\s]*)(?:[ \t]([\s\S]*))?$/u.exec(text);
  if (!match) return null;
  if (match[1] === '$' && /\s/u.test(text)) return null;
  return { kind: match[1] === '$' ? 'skill' : 'command', query: match[2] ?? '', remainder: match[3] ?? '' };
}
export function commandItems(
  skills: ChatSkill[],
  query: string,
  skillsOnly: boolean,
  canPlan: boolean,
): CommandItem[] {
  const needle = query.toLocaleLowerCase().replace(/^skill:/u, '');
  const commands: ComposerCommand[] = canPlan
    ? ['plan', 'read', 'edit', 'model', 'stash', 'restore']
    : ['read', 'edit', 'model', 'stash', 'restore'];
  const items: CommandItem[] = [
    ...(skillsOnly || /^skill:/iu.test(query)
      ? []
      : commands.map((command) => ({ key: command, id: '$' + command, command }))),
    ...skills.map((skill) => ({
      key: '$' + skill.name,
      id:
        '$' +
        (commands.some((command) => command === skill.name.toLocaleLowerCase()) ? 'skill:' : '') +
        skill.name,
      skill,
    })),
  ];
  return items.filter((item) =>
    (item.skill?.name ?? item.command ?? '').toLocaleLowerCase().includes(needle),
  );
}
