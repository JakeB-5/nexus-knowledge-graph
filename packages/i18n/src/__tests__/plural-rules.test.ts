import { describe, it, expect } from 'vitest';
import {
  getPluralCategory,
  getCardinalRule,
  getOrdinalRule,
  getOrdinalSuffix,
  cardinalRules,
} from '../plural-rules.js';

describe('Plural Rules', () => {
  describe('English cardinal rules', () => {
    it('1 → one', () => expect(getPluralCategory(1, 'en')).toBe('one'));
    it('0 → other', () => expect(getPluralCategory(0, 'en')).toBe('other'));
    it('2 → other', () => expect(getPluralCategory(2, 'en')).toBe('other'));
    it('100 → other', () => expect(getPluralCategory(100, 'en')).toBe('other'));
    it('21 → other', () => expect(getPluralCategory(21, 'en')).toBe('other'));
  });

  describe('Korean cardinal rules', () => {
    it('1 → other (no plural in Korean)', () => expect(getPluralCategory(1, 'ko')).toBe('other'));
    it('0 → other', () => expect(getPluralCategory(0, 'ko')).toBe('other'));
    it('100 → other', () => expect(getPluralCategory(100, 'ko')).toBe('other'));
  });

  describe('Japanese cardinal rules', () => {
    it('any number → other', () => {
      expect(getPluralCategory(1, 'ja')).toBe('other');
      expect(getPluralCategory(42, 'ja')).toBe('other');
    });
  });

  describe('French cardinal rules', () => {
    it('0 → one', () => expect(getPluralCategory(0, 'fr')).toBe('one'));
    it('1 → one', () => expect(getPluralCategory(1, 'fr')).toBe('one'));
    it('2 → other', () => expect(getPluralCategory(2, 'fr')).toBe('other'));
    it('100 → other', () => expect(getPluralCategory(100, 'fr')).toBe('other'));
  });

  describe('Russian cardinal rules', () => {
    it('1 → one', () => expect(getPluralCategory(1, 'ru')).toBe('one'));
    it('21 → one', () => expect(getPluralCategory(21, 'ru')).toBe('one'));
    it('2 → few', () => expect(getPluralCategory(2, 'ru')).toBe('few'));
    it('3 → few', () => expect(getPluralCategory(3, 'ru')).toBe('few'));
    it('4 → few', () => expect(getPluralCategory(4, 'ru')).toBe('few'));
    it('22 → few', () => expect(getPluralCategory(22, 'ru')).toBe('few'));
    it('5 → many', () => expect(getPluralCategory(5, 'ru')).toBe('many'));
    it('11 → many', () => expect(getPluralCategory(11, 'ru')).toBe('many'));
    it('20 → many', () => expect(getPluralCategory(20, 'ru')).toBe('many'));
    it('0 → many', () => expect(getPluralCategory(0, 'ru')).toBe('many'));
  });

  describe('Arabic cardinal rules', () => {
    it('0 → zero', () => expect(getPluralCategory(0, 'ar')).toBe('zero'));
    it('1 → one', () => expect(getPluralCategory(1, 'ar')).toBe('one'));
    it('2 → two', () => expect(getPluralCategory(2, 'ar')).toBe('two'));
    it('3 → few', () => expect(getPluralCategory(3, 'ar')).toBe('few'));
    it('10 → few', () => expect(getPluralCategory(10, 'ar')).toBe('few'));
    it('11 → many', () => expect(getPluralCategory(11, 'ar')).toBe('many'));
    it('99 → many', () => expect(getPluralCategory(99, 'ar')).toBe('many'));
    it('100 → other', () => expect(getPluralCategory(100, 'ar')).toBe('other'));
  });

  describe('locale aliases', () => {
    it('en-US uses English rules', () => {
      expect(getPluralCategory(1, 'en-US')).toBe('one');
      expect(getPluralCategory(2, 'en-US')).toBe('other');
    });

    it('fr-FR uses French rules', () => {
      expect(getPluralCategory(0, 'fr-FR')).toBe('one');
      expect(getPluralCategory(2, 'fr-FR')).toBe('other');
    });

    it('ko-KR uses Korean rules', () => {
      expect(getPluralCategory(1, 'ko-KR')).toBe('other');
    });
  });

  describe('language prefix fallback', () => {
    it('unknown locale falls back to "other"', () => {
      expect(getPluralCategory(1, 'xx')).toBe('other');
    });
  });

  describe('English ordinal rules', () => {
    it('1 → one (st)', () => expect(getPluralCategory(1, 'en', true)).toBe('one'));
    it('2 → two (nd)', () => expect(getPluralCategory(2, 'en', true)).toBe('two'));
    it('3 → few (rd)', () => expect(getPluralCategory(3, 'en', true)).toBe('few'));
    it('4 → other (th)', () => expect(getPluralCategory(4, 'en', true)).toBe('other'));
    it('11 → other (th)', () => expect(getPluralCategory(11, 'en', true)).toBe('other'));
    it('12 → other (th)', () => expect(getPluralCategory(12, 'en', true)).toBe('other'));
    it('21 → one (st)', () => expect(getPluralCategory(21, 'en', true)).toBe('one'));
    it('22 → two (nd)', () => expect(getPluralCategory(22, 'en', true)).toBe('two'));
  });

  describe('getOrdinalSuffix', () => {
    it('1st', () => expect(getOrdinalSuffix(1, 'en')).toBe('st'));
    it('2nd', () => expect(getOrdinalSuffix(2, 'en')).toBe('nd'));
    it('3rd', () => expect(getOrdinalSuffix(3, 'en')).toBe('rd'));
    it('4th', () => expect(getOrdinalSuffix(4, 'en')).toBe('th'));
    it('11th', () => expect(getOrdinalSuffix(11, 'en')).toBe('th'));
    it('21st', () => expect(getOrdinalSuffix(21, 'en')).toBe('st'));
    it('non-English returns empty', () => expect(getOrdinalSuffix(1, 'ko')).toBe(''));
  });

  describe('getCardinalRule', () => {
    it('returns a function', () => {
      const rule = getCardinalRule('en');
      expect(typeof rule).toBe('function');
    });
  });

  describe('getOrdinalRule', () => {
    it('returns a function', () => {
      const rule = getOrdinalRule('en');
      expect(typeof rule).toBe('function');
    });
  });

  describe('cardinalRules registry', () => {
    it('has English rule', () => expect(cardinalRules['en']).toBeDefined());
    it('has Korean rule', () => expect(cardinalRules['ko']).toBeDefined());
    it('has Russian rule', () => expect(cardinalRules['ru']).toBeDefined());
    it('has Arabic rule', () => expect(cardinalRules['ar']).toBeDefined());
    it('has French rule', () => expect(cardinalRules['fr']).toBeDefined());
  });
});
