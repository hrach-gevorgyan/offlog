import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// src/lib/phone and src/lib/shared must never reach into src/lib/desktop:
// a shared piece moves to shared/, or the desktop code lands in the phone chunk.
const lib = path.resolve(__dirname, '../src/lib');
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|svelte)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const reachesDesktop = (file: string) => [...fs.readFileSync(file, 'utf8').matchAll(/['"`](\.{1,2}\/[^'"`]+)['"`]/g)]
  .some(m => path.resolve(path.dirname(file), m[1]).startsWith(path.join(lib, 'desktop') + path.sep));

describe('source layout', () => {
  it('nothing in phone/ or shared/ imports from desktop/', () => {
    const offenders = [...files(path.join(lib, 'phone')), ...files(path.join(lib, 'shared'))]
      .filter(reachesDesktop).map(f => path.relative(lib, f));
    expect(offenders).toEqual([]);
  });
});
