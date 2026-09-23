import { afterEach, expect, it } from 'vitest';
import { diagnosticFromBridge, encodeDiagnostic } from '../src/domain/diagnostics';
import { appMessageCatalogs } from '../src/domain/messages/catalogs';
import i18n from '../src/renderer/i18n';
import { interfaceCatalogs } from '../src/renderer/locales/catalogs';
import { toastText, type Toast } from '../src/renderer/app/toast';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

it('renders a retained interface toast in the selected language', async () => {
  const toast: Toast = { kind: 'interface', key: 'checkStillMissing' };
  expect(toastText(toast)).toBe(interfaceCatalogs.en.checkStillMissing);
  await i18n.changeLanguage('ja');
  expect(toastText(toast)).toBe(interfaceCatalogs.ja.checkStillMissing);
  await i18n.changeLanguage('en');
  expect(toastText(toast)).toBe(interfaceCatalogs.en.checkStillMissing);
});

it('retranslates decoded app diagnostics while keeping parameters and provider detail exact', async () => {
  const raw = 'ENOENT: /tmp/制作 & clips/start.js\nprovider output: "keep this text"';
  const toast = diagnosticFromBridge(
    new Error(
      encodeDiagnostic({
        kind: 'app',
        message: { id: 'mediaStudioExited', params: { code: 17 } },
        externalDetail: raw,
      }),
    ),
  );
  for (const locale of ['en', 'ja'] as const) {
    await i18n.changeLanguage(locale);
    expect(toastText(toast)).toBe(
      `${appMessageCatalogs[locale].mediaStudioExited.replace('{{code}}', '17')}\n${raw}`,
    );
  }
});

it('distinguishes saved receipt descriptors from identical external prose and wire-looking text', async () => {
  const receipt: Toast = { kind: 'app', message: { id: 'turnSaved' } };
  const prose: Toast = { kind: 'external', text: appMessageCatalogs.en.turnSaved };
  const marker: Toast = { kind: 'external', text: encodeDiagnostic(receipt) };
  await i18n.changeLanguage('ja');
  expect(toastText(receipt)).toBe(appMessageCatalogs.ja.turnSaved);
  expect(toastText(prose)).toBe(appMessageCatalogs.en.turnSaved);
  expect(toastText(marker)).toBe(marker.text);
});
