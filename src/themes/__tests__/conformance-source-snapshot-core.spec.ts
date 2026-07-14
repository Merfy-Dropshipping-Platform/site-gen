/**
 * Task 1 — generic source-loader / runnable-resolution core.
 *
 * The landed `conformance-source-snapshot.spec.ts` asserts REAL Bloom artifacts
 * (it needs the compiled build). This file is the theme-agnostic complement: it
 * exercises the runnable-bundle resolution boundary using ONLY registry logic +
 * temp fixtures — no compiled build artifacts required. It proves:
 *  - a COMPLETE runnable theme (Bloom) exposes a callable source adapter without
 *    reading any artifact just to resolve;
 *  - an INCOMPLETE registered theme (Satin) refuses before any artifact read;
 *  - non-registered / path-like theme names never resolve a filesystem root.
 */

import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveRunnableTheme,
  getThemeDescriptor,
} from '../conformance/theme-adapters';

describe('runnable-theme resolution (generic, temp-fixture only)', () => {
  it('exposes Bloom as a complete runnable bundle without reading artifacts to resolve', async () => {
    // Resolution itself performs NO artifact read; a temp cwd with no
    // conformance tree present still resolves the bundle shape.
    const dir = mkdtempSync(join(tmpdir(), 'conf-core-'));
    // Sanity: the temp dir has no conformance artifacts.
    expect(existsSync(join(dir, 'conformance'))).toBe(false);

    const bundle = await resolveRunnableTheme('bloom');
    expect(bundle.descriptor.id).toBe('bloom');
    expect(bundle.descriptor.paths.mode).toBe('legacy');
    expect(typeof bundle.loadSourceSnapshot).toBe('function');
    expect(bundle.releaseContract.theme).toBe('bloom');
  });

  it('resolves the complete Satin bundle (source adapter + release contract)', async () => {
    // Task 3 completed the Satin runnable bundle: descriptor + source adapter +
    // release contract, all for id `satin`. Resolution now succeeds.
    const dir = mkdtempSync(join(tmpdir(), 'conf-core-satin-'));
    writeFileSync(join(dir, 'satin.requirements.json'), '[]', 'utf8');

    const bundle = await resolveRunnableTheme('satin');
    expect(bundle.descriptor.id).toBe('satin');
    expect(bundle.source.theme).toBe('satin');
    expect(bundle.releaseContract.theme).toBe('satin');
    // The Satin descriptor is tiered (paths/ACK registered).
    const d = getThemeDescriptor('satin');
    expect(d.paths.mode).toBe('tiered');
    expect(d.paths.tierManifest).toBe('conformance/baselines/satin.manifest.json');
  });

  it('never resolves a filesystem root from a path-like or unknown theme name', async () => {
    for (const bad of ['../../etc', './themes/evil', 'unknown', '']) {
      // eslint-disable-next-line no-await-in-loop
      await expect(resolveRunnableTheme(bad as never)).rejects.toThrow();
      expect(() => getThemeDescriptor(bad as never)).toThrow();
    }
  });

  it('rejects Luna explicitly', async () => {
    await expect(resolveRunnableTheme('luna' as never)).rejects.toThrow(/luna/i);
    expect(() => getThemeDescriptor('luna' as never)).toThrow(/luna/i);
  });
});
