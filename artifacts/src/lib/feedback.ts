export type FeedbackKind = 'success' | 'danger' | 'info';
export type VibrationStyle = 'subtle' | 'standard' | 'strong';
export type SoundStyle = 'soft' | 'bright' | 'low';

const VIBRATION_KEY = 'att_feedback_vibration_v1';
const VIBRATION_STYLE_KEY = 'att_feedback_vibration_style_v1';
const SOUND_KEY = 'att_feedback_sound_v1';
const SOUND_VOLUME_KEY = 'att_feedback_sound_volume_v1';
const SOUND_STYLE_KEY = 'att_feedback_sound_style_v1';

const vibrationPatterns: Record<VibrationStyle, number | number[]> = {
  subtle: 35,
  standard: [55, 35, 55],
  strong: [90, 45, 90],
};

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
}

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function getVibrationEnabled(): boolean {
  return readBoolean(VIBRATION_KEY, true);
}

export function setVibrationEnabled(enabled: boolean): void {
  localStorage.setItem(VIBRATION_KEY, String(enabled));
}

export function getVibrationStyle(): VibrationStyle {
  if (typeof window === 'undefined') return 'standard';
  const value = window.localStorage.getItem(VIBRATION_STYLE_KEY);
  return value === 'subtle' || value === 'strong' ? value : 'standard';
}

export function setVibrationStyle(style: VibrationStyle): void {
  localStorage.setItem(VIBRATION_STYLE_KEY, style);
}

export function getSoundEnabled(): boolean {
  return readBoolean(SOUND_KEY, false);
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
}

export function getSoundVolume(): number {
  if (typeof window === 'undefined') return 0.5;
  const value = Number(window.localStorage.getItem(SOUND_VOLUME_KEY));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

export function setSoundVolume(volume: number): void {
  localStorage.setItem(SOUND_VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
}

export function getSoundStyle(): SoundStyle {
  if (typeof window === 'undefined') return 'soft';
  const value = window.localStorage.getItem(SOUND_STYLE_KEY);
  return value === 'bright' || value === 'low' ? value : 'soft';
}

export function setSoundStyle(style: SoundStyle): void {
  localStorage.setItem(SOUND_STYLE_KEY, style);
}

function playConfirmationTone(kind: FeedbackKind): void {
  if (typeof window === 'undefined' || !getSoundEnabled()) return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'danger' ? 'square' : 'sine';
    oscillator.frequency.value = 620 + (kind === 'success' ? 80 : kind === 'danger' ? -80 : 0);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    const volume = getSoundVolume();
    gain.gain.exponentialRampToValueAtTime(0.0001 + (0.24 * volume), context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
    oscillator.addEventListener('ended', () => void context.close());
  } catch {
    // Feedback is best-effort and must never affect the confirmed action.
  }
}

export function triggerConfirmationFeedback(kind: FeedbackKind = 'success'): void {
  if (typeof window === 'undefined') return;
  if (getVibrationEnabled() && isVibrationSupported()) {
    try { navigator.vibrate(vibrationPatterns[getVibrationStyle()]); } catch {}
  }
  playConfirmationTone(kind);
}

export function testConfirmationFeedback(): void {
  triggerConfirmationFeedback('success');
}
