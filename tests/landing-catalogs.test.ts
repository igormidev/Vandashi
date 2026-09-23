import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { siteLocales } from '../landing/src/language';
import { catalogs } from '../landing/src/locales/catalogs';

const literals = [
  'https://github.com/igormidev/Vandashi',
  'README',
  'AGENTS.md',
  'Node.js 24',
  'ONNXRUNTIME_NODE_INSTALL=skip',
  'npm ci',
  'CPU',
  'CUDA',
  'Git',
  'Codex CLI',
];

describe('landing translation contracts', () => {
  it.each(siteLocales)(
    '%s preserves the complete copy and executable installation instructions',
    (locale) => {
      const translated = catalogs[locale];
      expect(Object.keys(translated).sort()).toEqual(Object.keys(catalogs.en).sort());
      for (const [key, value] of Object.entries(translated)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
        const source = catalogs.en[key as keyof typeof catalogs.en];
        expect(value.match(/\{\{[^}]+\}\}/g) ?? [], key).toEqual(source.match(/\{\{[^}]+\}\}/g) ?? []);
      }
      expect(translated.setupPrompt.match(/`[^`]+`/g)).toEqual(catalogs.en.setupPrompt.match(/`[^`]+`/g));
      for (const literal of literals)
        expect(translated.setupPrompt.split(literal).length, `${locale}:${literal}`).toBe(
          catalogs.en.setupPrompt.split(literal).length,
        );
      expect(translated.creationAlt).toContain('The hidden city');
      expect(translated.directionAlt).toContain('Northstar Stories');
      expect(translated.clipsAlt).toContain('A hidden city');
    },
  );

  it.each(siteLocales)('%s cannot hide duplicate keys behind JSON import behavior', async (locale) => {
    const file = `landing/src/locales/${locale}.json`;
    const raw = await readFile(file, 'utf8');
    expect(() => JSON.parse(raw) as unknown).not.toThrow();
    const parsed = ts.parseJsonText(file, raw);
    const statement = parsed.statements[0];
    if (!statement || !ts.isExpressionStatement(statement)) throw new Error(`Invalid catalog: ${file}`);
    const object = statement.expression;
    if (!ts.isObjectLiteralExpression(object)) throw new Error(`Invalid catalog object: ${file}`);
    const keys = object.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name))
        throw new Error(`Invalid catalog key: ${file}`);
      return property.name.text;
    });
    expect(new Set(keys).size, file).toBe(keys.length);
  });

  it('gives site visitors the same complete installation prompt as the README', async () => {
    const readme = await readFile('README.md', 'utf8');
    const installSection = readme.split('## Ask an agent to install it')[1]?.split('\n## ')[0];
    expect(installSection).toBeDefined();
    const prompt = installSection
      ?.split('\n')
      .filter((line) => line.startsWith('> '))
      .map((line) => line.slice(2))
      .join(' ');
    expect(prompt).toBe(catalogs.en.setupPrompt);
  });
});
