export type ThemePreference = 'system' | 'light' | 'dark';
export type AccentTheme = 'default' | 'green' | 'orange' | 'red';
export type FontPreference = 'system' | 'sf' | 'inter' | 'manrope' | 'nunito' | 'dmSans' | 'jakarta' | 'outfit' | 'lora' | 'spaceGrotesk' | 'robotoMono' | 'caveat' | 'oswald' | 'playfair' | 'sourceCode' | 'comfortaa';

export const THEME_KEY = 'theme';
export const ACCENT_THEME_KEY = 'attendenz_accent_theme_v1';
export const FONT_KEY = 'attendenz_font_preference_v1';

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function resolveDarkTheme(preference: ThemePreference): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveDarkTheme(preference));
}

export function readAccentTheme(): AccentTheme {
  if (typeof window === 'undefined') return 'default';
  const saved = window.localStorage.getItem(ACCENT_THEME_KEY);
  if (saved === 'blue') {
    window.localStorage.setItem(ACCENT_THEME_KEY, 'orange');
    return 'orange';
  }
  return saved === 'green' || saved === 'orange' || saved === 'red' ? saved : 'default';
}

export function applyAccentTheme(theme: AccentTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.accentTheme = theme;
}

export function readFontPreference(): FontPreference {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem(FONT_KEY);
  return saved === 'sf' || saved === 'inter' || saved === 'manrope' || saved === 'nunito' || saved === 'dmSans' || saved === 'jakarta' || saved === 'outfit' || saved === 'lora' || saved === 'spaceGrotesk' || saved === 'robotoMono' || saved === 'caveat' || saved === 'oswald' || saved === 'playfair' || saved === 'sourceCode' || saved === 'comfortaa' ? saved : 'system';
}

export function applyFontPreference(font: FontPreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.fontPreference = font;
}
