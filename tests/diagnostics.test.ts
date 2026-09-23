import { describe, expect, it } from 'vitest';
import {
  AppFault,
  diagnosticFromBridge,
  diagnosticFromError,
  diagnosticWireLimit,
  encodeDiagnostic,
  envelopeDiagnostic,
  failureEnvelope,
  parseAppMessage,
  parseDiagnostic,
} from '../src/domain/diagnostics';
import { appMessageEnglish } from '../src/domain/messages';

describe('explicit application diagnostics', () => {
  it('keeps a typed message and parameters while preserving an English log fallback', () => {
    const message = { id: 'restoredDocument', params: { name: '台本.md' } } as const;
    const error = new AppFault(message);
    expect(error.message).toBe('Restored the missing 台本.md from Git.');
    expect(diagnosticFromError(error)).toEqual({ kind: 'app', message });
    expect(appMessageEnglish(message)).toBe(error.message);
  });

  it('does not translate external text that happens to equal an owned message', () => {
    const error = new Error('This image cannot be copied.');
    expect(diagnosticFromError(error)).toEqual({ kind: 'external', text: error.message });
  });

  it('survives copying only Error.message and never decodes external prose recursively', () => {
    const error = new AppFault({ id: 'assetMetadataConflict' }, 'Upstream details remain verbatim.');
    const diagnostic = diagnosticFromError(error);
    const copied = new Error(encodeDiagnostic(diagnostic));
    expect(diagnosticFromBridge(copied)).toEqual(diagnostic);
    const external = diagnosticFromError(new Error(copied.message));
    expect(diagnosticFromBridge(new Error(encodeDiagnostic(external)))).toEqual(external);
  });

  it('round-trips maximum-length escaped text, parameters, and external detail', () => {
    const escaped = '\u001b'.repeat(32_768);
    for (const diagnostic of [
      diagnosticFromError(new Error(escaped)),
      diagnosticFromError(
        new AppFault({ id: 'recoveredDocument', params: { name: escaped, path: escaped } }, escaped),
      ),
    ]) {
      const wire = encodeDiagnostic(diagnostic);
      expect(wire.length).toBeLessThanOrEqual(diagnosticWireLimit);
      expect(diagnosticFromBridge(new Error(wire))).toEqual(diagnostic);
    }
  });

  it.each([
    { id: 'notARegisteredMessage' },
    { id: 'restoredDocument' },
    { id: 'restoredDocument', params: { wrong: 'script.md' } },
    { id: 'restoredDocument', params: { name: 'script.md', extra: 'unexpected' } },
    { id: 'restoredDocument', params: { name: {} } },
    { id: 'restoredDocument', params: { name: Number.NaN } },
    { id: 'restoredDocument', params: { name: 'x'.repeat(32_769) } },
    { id: 'turnSaved', params: {} },
    { id: 'turnSaved', arbitrary: true },
  ])('rejects an invalid message descriptor %#', (value) => {
    expect(parseAppMessage(value)).toBeNull();
  });

  it.each([
    'VANDASHI_DIAGNOSTIC_V2:{}',
    'VANDASHI_DIAGNOSTIC_V1:{"kind":"app","message":{"id":"unknown"}}',
    'VANDASHI_DIAGNOSTIC_V1:broken',
    'VANDASHI_DIAGNOSTIC_V1:' + 'x'.repeat(diagnosticWireLimit),
  ])('uses a known diagnostic for an invalid wire payload %#', (value) => {
    expect(diagnosticFromBridge(new Error(value))).toEqual({
      kind: 'app',
      message: { id: 'invalidDiagnostic' },
    });
  });

  it('distinguishes failures from successful empty and ordinary values', () => {
    for (const value of [undefined, null, false, '', [], {}, { value: 'saved' }])
      expect(envelopeDiagnostic(value)).toBeNull();
    expect(envelopeDiagnostic(failureEnvelope(new AppFault({ id: 'imageCannotCopy' })))).toEqual({
      kind: 'app',
      message: { id: 'imageCannotCopy' },
    });
    expect(envelopeDiagnostic({ __vandashiFailure: 'v2' })).toEqual({
      kind: 'app',
      message: { id: 'invalidDiagnostic' },
    });
  });

  it('bounds external error text and rejects unexpected diagnostic properties', () => {
    expect(diagnosticFromError(new Error('x'.repeat(40_000)))).toEqual({
      kind: 'external',
      text: 'x'.repeat(32_768),
    });
    expect(parseDiagnostic({ kind: 'external', text: 'original', message: { id: 'turnSaved' } })).toBeNull();
  });
});
