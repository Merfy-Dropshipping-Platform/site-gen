import { join } from 'node:path';
import {
  BLOCK_ASSEMBLY_DESTINATIONS,
  blocksDestinationDir,
  customBlocksDestinationDir,
  assembledBlockAstroPath,
  assembledComponentPath,
  type BlockLocation,
} from '../block-assembly-layout';

// Parity tests pinning the CURRENT assembler destination mapping
// (copyBlocksFromPackage / copyCustomBlocks in assemble-from-packages.ts).
// The assembler must consume these helpers; conformance uses the same mapping
// to prove generator `importPath` matches the real assembler destination.

describe('block-assembly-layout (assembler destination mapping parity)', () => {
  it('maps block locations to their output subdirs under src/', () => {
    expect(BLOCK_ASSEMBLY_DESTINATIONS).toEqual({
      blocks: 'src/components',
      customBlocks: 'src/customBlocks',
    });
  });

  it('blocksDestinationDir: <outputDir>/src/components', () => {
    expect(blocksDestinationDir('/out')).toBe(join('/out', 'src', 'components'));
  });

  it('customBlocksDestinationDir: <outputDir>/src/customBlocks', () => {
    expect(customBlocksDestinationDir('/out')).toBe(
      join('/out', 'src', 'customBlocks'),
    );
  });

  it('blocks and customBlocks destinations are distinct', () => {
    expect(blocksDestinationDir('/out')).not.toBe(
      customBlocksDestinationDir('/out'),
    );
  });

  it('assembledBlockAstroPath: blocks/X/X.astro -> src/components/X.astro', () => {
    expect(assembledBlockAstroPath('/out', 'Benefits')).toBe(
      join('/out', 'src', 'components', 'Benefits.astro'),
    );
    expect(assembledComponentPath('/out', 'Benefits.astro')).toBe(
      join('/out', 'src', 'components', 'Benefits.astro'),
    );
  });

  it('destination lookup by location key', () => {
    const cases: Array<[BlockLocation, string]> = [
      ['blocks', 'src/components'],
      ['customBlocks', 'src/customBlocks'],
    ];
    for (const [loc, expected] of cases) {
      expect(BLOCK_ASSEMBLY_DESTINATIONS[loc]).toBe(expected);
    }
  });
});
