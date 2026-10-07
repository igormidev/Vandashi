import type { ChatSkill } from '../../../domain/chat-skills';

export type ComposerCommand = 'plan' | 'read' | 'edit' | 'compact' | 'model';
export interface CommandItem {
  id: string;
  command?: ComposerCommand;
  skill?: ChatSkill;
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
    ? ['plan', 'read', 'edit', 'compact', 'model']
    : ['read', 'edit', 'model'];
  return [
    ...(skillsOnly ? [] : commands.map((command) => ({ id: '/' + command, command }))),
    ...skills.map((skill) => ({ id: '$' + skill.name, skill })),
  ].filter((item) => item.id.slice(1).toLocaleLowerCase().includes(needle));
}
