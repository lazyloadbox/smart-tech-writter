import { en, type UiCopy } from './en';

export type UiLocale = 'en-US';

export const DEFAULT_UI_LOCALE: UiLocale = 'en-US';

/** Locale registry. Add a locale module here when another UI language is ready. */
export const UI_MESSAGES: Record<UiLocale, UiCopy> = {
  'en-US': en,
};

export const getUiMessages = (locale: UiLocale = DEFAULT_UI_LOCALE): UiCopy =>
  UI_MESSAGES[locale] ?? UI_MESSAGES[DEFAULT_UI_LOCALE];

export { en, formatUi, languageLabel, pluralUnit } from './en';

