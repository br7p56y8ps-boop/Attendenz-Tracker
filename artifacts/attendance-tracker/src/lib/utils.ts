import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getCurrentDateStr(date: Date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

// New shared color logic
export const pctColor = (pct: number, preferredPercentage: number) => {
  const GREEN_OFFSET = 5;
  if (pct >= preferredPercentage + GREEN_OFFSET) return 'var(--color-success)';
  if (pct >= preferredPercentage) return 'var(--color-warning)';
  return 'var(--color-destructive)';
};