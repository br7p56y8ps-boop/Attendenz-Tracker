export type NavBarStyle = 'fixed' | 'floating';

export const NAV_BAR_STYLE_KEY = 'attendenz_nav_bar_style_v1';
export const NAV_BAR_STYLE_CHANGED_EVENT = 'attendenz:nav-bar-style-changed';

export function readNavBarStyle(): NavBarStyle {
  if (typeof window === 'undefined') return 'fixed';
  return window.localStorage.getItem(NAV_BAR_STYLE_KEY) === 'floating' ? 'floating' : 'fixed';
}

export function applyNavBarStyle(style: NavBarStyle): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.navBarStyle = style;
}

export function saveNavBarStyle(style: NavBarStyle): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NAV_BAR_STYLE_KEY, style);
  applyNavBarStyle(style);
  window.dispatchEvent(new Event(NAV_BAR_STYLE_CHANGED_EVENT));
}
