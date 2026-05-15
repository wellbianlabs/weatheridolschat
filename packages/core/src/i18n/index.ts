import en from './messages/en.json';
import ja from './messages/ja.json';
import ko from './messages/ko.json';

export const LOCALES = ['ko', 'en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export const MESSAGES: Record<Locale, Record<string, string>> = { ko, en, ja };

export function t(locale: Locale, key: string, fallback?: string): string {
  return MESSAGES[locale]?.[key] ?? fallback ?? key;
}
