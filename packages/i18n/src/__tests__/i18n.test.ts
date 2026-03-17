import { describe, it, expect, beforeEach } from 'vitest';
import { I18n, createI18n } from '../i18n.js';
import { en } from '../translations/en.js';
import { ko } from '../translations/ko.js';

describe('I18n', () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = createI18n({
      locale: 'en',
      fallbackLocale: 'en',
      translations: { en, ko },
    });
  });

  describe('basic translation', () => {
    it('translates a simple key', () => {
      expect(i18n.t('common.save')).toBe('Save');
    });

    it('translates nested key with dot notation', () => {
      expect(i18n.t('errors.not_found')).toBe('The requested resource was not found.');
    });

    it('returns key for missing translation', () => {
      expect(i18n.t('missing.key')).toBe('missing.key');
    });

    it('uses custom missing key handler', () => {
      const custom = createI18n({
        locale: 'en',
        translations: { en },
        missingKeyHandler: (key) => `[MISSING: ${key}]`,
      });
      expect(custom.t('does.not.exist')).toBe('[MISSING: does.not.exist]');
    });
  });

  describe('interpolation', () => {
    it('interpolates single parameter', () => {
      expect(i18n.t('errors.required', { field: 'Email' })).toBe('Email is required.');
    });

    it('interpolates multiple parameters', () => {
      expect(i18n.t('errors.too_short', { field: 'Password', min: 8 }))
        .toBe('Password must be at least 8 characters.');
    });

    it('interpolates URL in auth messages', () => {
      expect(i18n.t('auth.sign_in_with', { provider: 'Google' }))
        .toBe('Sign in with Google');
    });

    it('interpolates email in verification message', () => {
      expect(i18n.t('auth.verification_sent', { email: 'user@example.com' }))
        .toBe('A verification email has been sent to user@example.com.');
    });
  });

  describe('pluralization', () => {
    it('uses singular form for count=1 (en)', () => {
      expect(i18n.tn('nodes.count', 1)).toBe('1 node');
    });

    it('uses plural form for count=2 (en)', () => {
      expect(i18n.tn('nodes.count', 2)).toBe('2 nodes');
    });

    it('uses plural form for count=0 (en)', () => {
      expect(i18n.tn('nodes.count', 0)).toBe('0 nodes');
    });

    it('interpolates count in plural message', () => {
      expect(i18n.tn('edges.count', 5)).toBe('5 edges');
    });
  });

  describe('locale switching', () => {
    it('switches to Korean locale', () => {
      i18n.setLocale('ko');
      expect(i18n.t('common.save')).toBe('저장');
    });

    it('returns locale', () => {
      expect(i18n.getLocale()).toBe('en');
      i18n.setLocale('ko');
      expect(i18n.getLocale()).toBe('ko');
    });

    it('falls back to fallback locale for missing ko key', () => {
      // If ko is missing a key that en has, falls back
      const custom = createI18n({
        locale: 'ko',
        fallbackLocale: 'en',
        translations: {
          en,
          ko: { common: { save: '저장' } },
        },
      });
      // 'errors.not_found' not in minimal ko → falls back to en
      expect(custom.t('errors.not_found')).toBe('The requested resource was not found.');
    });
  });

  describe('Korean translations', () => {
    beforeEach(() => {
      i18n.setLocale('ko');
    });

    it('translates common.cancel to Korean', () => {
      expect(i18n.t('common.cancel')).toBe('취소');
    });

    it('translates errors.unauthorized to Korean', () => {
      expect(i18n.t('errors.unauthorized')).toBe('이 작업을 수행할 권한이 없습니다.');
    });

    it('translates auth.login to Korean', () => {
      expect(i18n.t('auth.login')).toBe('로그인');
    });

    it('translates nodes.types.person to Korean', () => {
      expect(i18n.t('nodes.types.person')).toBe('사람');
    });

    it('uses Korean plural (other only)', () => {
      expect(i18n.tn('nodes.count', 1)).toBe('노드 1개');
      expect(i18n.tn('nodes.count', 5)).toBe('노드 5개');
    });
  });

  describe('has()', () => {
    it('returns true for existing key', () => {
      expect(i18n.has('common.save')).toBe(true);
    });

    it('returns false for missing key', () => {
      expect(i18n.has('does.not.exist')).toBe(false);
    });
  });

  describe('load()', () => {
    it('loads additional translations', () => {
      i18n.load('en', { custom: { greeting: 'Hello!' } });
      expect(i18n.t('custom.greeting')).toBe('Hello!');
    });

    it('merges with existing translations', () => {
      i18n.load('en', { common: { newKey: 'New Value' } });
      expect(i18n.t('common.save')).toBe('Save'); // existing preserved
      expect(i18n.t('common.newKey')).toBe('New Value');
    });
  });

  describe('number formatting', () => {
    it('formats a number with locale', () => {
      const result = i18n.formatNumber(1234567.89);
      expect(result).toContain('1,234,567');
    });

    it('formats percent', () => {
      const result = i18n.formatPercent(0.42);
      expect(result).toContain('42');
    });

    it('formats compact numbers', () => {
      expect(i18n.formatCompact(1500)).toBe('1.5K');
      expect(i18n.formatCompact(2500000)).toBe('2.5M');
      expect(i18n.formatCompact(3500000000)).toBe('3.5B');
    });
  });

  describe('currency formatting', () => {
    it('formats USD currency', () => {
      const result = i18n.formatCurrency(1234.56, 'USD');
      expect(result).toContain('1,234.56');
    });
  });

  describe('date formatting', () => {
    const date = new Date('2024-06-15T12:00:00Z');

    it('formats a date', () => {
      const result = i18n.formatDate(date);
      expect(result).toContain('2024');
    });

    it('formats relative time', () => {
      const recent = new Date(Date.now() - 5 * 60 * 1000);
      expect(i18n.formatRelative(recent)).toContain('5');
    });
  });

  describe('createI18n factory', () => {
    it('creates an I18n instance', () => {
      const instance = createI18n({ locale: 'en' });
      expect(instance).toBeInstanceOf(I18n);
    });
  });
});
