import { describe, expect, it } from 'vitest';
import { splitHighlight, stripCommas } from '../lib/format';

describe('stripCommas', () => {
  it('removes commas and whitespace', () => {
    expect(stripCommas('12,000')).toBe('12000');
    expect(stripCommas(' 1 200 ')).toBe('1200');
  });
});

describe('splitHighlight', () => {
  it('splits around the first case-insensitive match', () => {
    expect(splitHighlight('123가4567', '가45')).toEqual(['123', '가45', '67']);
    expect(splitHighlight('ABCdef', 'cd')).toEqual(['AB', 'Cd', 'ef']);
  });
  it('returns the whole string when there is no match', () => {
    expect(splitHighlight('hello', 'zz')).toEqual(['hello', '', '']);
  });
});
