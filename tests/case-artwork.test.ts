import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const covers = [
  ['line-13', 'after-hours-cover.png'],
  ['dead-air', 'dead-air-case.png'],
  ['night-glass', 'barjeel-cover.png'],
  ['long-table', 'long-table-case.png'],
  ['last-light', 'last-light-case.png'],
] as const;

describe('bundled original case covers', () => {
  it.each(covers)('%s points to its original, full-size PNG artwork', (id, filename) => {
    const component = readFileSync(resolve('src/components/CaseArtwork.tsx'), 'utf8');
    expect(component).toContain(`'${id}': require('@/assets/art/${filename}')`);
    const image = readFileSync(resolve('assets/art', filename));
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(image.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
    expect(image.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
  });
});
