import { ESLint } from 'eslint';
import ts from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Exercise the production file scopes and options, without a TypeScript project for synthetic text.
const eslint = new ESLint({ overrideConfig: [ts.configs.disableTypeChecked] });
async function violations(filePath: string, source: string) {
  const results = await eslint.lintText(source, { filePath });
  return results.flatMap((result) =>
    result.messages.filter((message) => message.ruleId === 'i18next/no-literal-string'),
  );
}

describe('localized source policy', () => {
  it.each([
    [
      'conditional accessible description',
      'landing/src/App.tsx',
      'export const view = <input aria-description={invalid ? "Enter a name" : "Name is valid"} />;',
    ],
    [
      'conditional native option label',
      'landing/src/App.tsx',
      'export const view = <option label={first ? "First choice" : "Another choice"} />;',
    ],
    [
      'nested conditional machine spelling',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{ready ? (readOnly ? "read" : "edit") : t("waiting")}</button>;',
    ],
    [
      'logical fallback machine spelling',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{label || "edit"}</button>;',
    ],
    [
      'logical right-hand output',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{enabled && "edit"}</button>;',
    ],
    [
      'concatenated machine spelling',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{"read" + suffix}</button>;',
    ],
    [
      'nested template expression',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{`${readOnly ? "read" : "edit"}`}</button>;',
    ],
    [
      'type-asserted output',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{(readOnly ? "read" : "edit") as string}</button>;',
    ],
    ['uppercase constant', 'src/renderer/shared/format.ts', 'export const LABEL = "Save changes";'],
    [
      'default argument',
      'src/renderer/shared/format.ts',
      'export function label(value = "Save changes") { return value; }',
    ],
    [
      'event callback',
      'src/renderer/shared/format.ts',
      'addEventListener("click", () => alert("Save changes"));',
    ],
    [
      'machine spelling used as copy',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{"edit"}</button>;',
    ],
    ['native option label', 'landing/src/App.tsx', 'export const view = <option label="First choice" />;'],
    [
      'accessible description',
      'landing/src/App.tsx',
      'export const view = <input aria-description="Enter a name" />;',
    ],
    ['JSX text', 'src/renderer/features/brands/Home.tsx', 'export const view = <p>Save changes</p>;'],
    [
      'attribute',
      'src/renderer/features/brands/Home.tsx',
      'export const view = <input placeholder="Enter a name" />;',
    ],
    ['accessible label', 'landing/src/App.tsx', 'export const view = <button aria-label="Close dialog" />;'],
    ['expression', 'src/renderer/features/brands/Home.tsx', 'export const view = <p>{"Save changes"}</p>;'],
    ['template', 'src/renderer/features/brands/Home.tsx', 'export const view = <p>{`Hello ${name}`}</p>;'],
    ['helper', 'src/renderer/shared/format.ts', 'export const label = () => "Save changes";'],
    ['helper template', 'landing/src/language.ts', 'export const label = (name: string) => `Hello ${name}`;'],
  ])('rejects untranslated %s', async (_name, path, source) => {
    expect(await violations(path, source)).not.toHaveLength(0);
  });

  it.each([
    [
      'translated conditional attribute',
      'landing/src/App.tsx',
      'export const view = <input aria-description={invalid ? t("enterName") : t("validName")} />;',
    ],
    [
      'comparison predicate',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{mode === "read" ? t("readOnly") : t("edit")}</button>;',
    ],
    [
      'callee argument boundary',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{modes.includes("read")}</button>;',
    ],
    [
      'logical left-hand predicate',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button>{"read" && t("readOnly")}</button>;',
    ],
    [
      'conditional machine attribute',
      'src/renderer/features/chat/Composer.tsx',
      'export const view = <button data-mode={readOnly ? "read" : "edit"}>{t("mode")}</button>;',
    ],
    [
      'translations',
      'src/renderer/features/brands/Home.tsx',
      'export const view = <input placeholder={t("brandName")} />;',
    ],
    [
      'raw user content',
      'src/renderer/features/brands/Home.tsx',
      'export const view = <p>{brand.title}</p>;',
    ],
    [
      'CSS and type keys',
      'src/renderer/features/brands/Home.tsx',
      'export const view = <button className="primary" type="button">{t("save")}</button>;',
    ],
    [
      'raw provider output',
      'src/renderer/features/chat/ChatPane.tsx',
      'export const view = <p>{message.text}</p>;',
    ],
    [
      'protocol template',
      'src/renderer/features/assets/AssetInspector.tsx',
      'export const target = { topic: `asset:${asset.id}` };',
    ],
    ['CSS color', 'src/renderer/features/brands/TasteIcon.tsx', 'export const color = "#b1a0ff";'],
    ['catalogs', 'src/renderer/locales/en.ts', 'export const labels = { save: "Save changes" };'],
    ['site catalogs', 'landing/src/locales/catalogs.ts', 'export const labels = { save: "Save changes" };'],
  ])('permits %s', async (_name, path, source) => {
    expect(await violations(path, source)).toHaveLength(0);
  });
});
