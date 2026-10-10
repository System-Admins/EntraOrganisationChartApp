import { describe, expect, it } from 'vitest';
import { fold } from './fold';

describe('fold', () => {
  it('ignores case and accents', () => {
    expect(fold('Daniel Müller')).toBe('daniel muller');
    expect(fold('Åse Vik')).toBe('ase vik');
    expect(fold('Contoso Česko')).toBe('contoso cesko');
  });

  it('spells letters that have no accent to strip the way people type them', () => {
    expect(fold('Jørgen Øverland')).toBe('jorgen overland');
    expect(fold('Ægir Strauß')).toBe('aegir strauss');
    expect(fold('Łukasz')).toBe('lukasz');
  });

  it('only lowers the case of plain text, punctuation and spaces included', () => {
    expect(fold('Anne-Marie DAHL')).toBe('anne-marie dahl');
    expect(fold('')).toBe('');
  });
});
