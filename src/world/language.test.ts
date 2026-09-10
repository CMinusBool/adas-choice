import { describe, expect, it } from 'vitest';

import { resolveLanguage, toggleLanguage } from './language';

describe('language selection', () => {
  it('falls back to Traditional Chinese when nothing has been stored', () => {
    expect(resolveLanguage(null)).toBe('zh-Hant');
  });

  it('picks English up from a stored preference', () => {
    expect(resolveLanguage('en')).toBe('en');
  });

  it('falls back to Traditional Chinese when storage cannot be read', () => {
    expect(resolveLanguage(undefined)).toBe('zh-Hant');
  });

  it('falls back to Traditional Chinese for a value it does not recognise', () => {
    expect(resolveLanguage('zh-Hans')).toBe('zh-Hant');
    expect(resolveLanguage('EN')).toBe('zh-Hant');
    expect(resolveLanguage('')).toBe('zh-Hant');
  });
});

describe('the language toggle', () => {
  it('offers English while Traditional Chinese is in force', () => {
    expect(toggleLanguage('zh-Hant')).toBe('en');
  });

  it('offers Traditional Chinese while English is in force', () => {
    expect(toggleLanguage('en')).toBe('zh-Hant');
  });

  it('returns to where it started after two turns', () => {
    expect(toggleLanguage(toggleLanguage('zh-Hant'))).toBe('zh-Hant');
  });
});
