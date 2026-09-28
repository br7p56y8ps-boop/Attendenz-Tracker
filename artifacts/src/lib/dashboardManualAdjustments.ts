import { idbGet, storageSetItemChecked } from '@/lib/idb';

export const DASHBOARD_MANUAL_ADJUSTMENTS_KEY = 'att_dashboard_manual_adjustments_v1';

export interface DashboardManualAdjustment {
  id: string;
  subjectKey: string;
  delta: number;
  date: string;
  createdAt: number;
}

let appendQueue: Promise<void> = Promise.resolve();

function readLocalAdjustments(): DashboardManualAdjustment[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_MANUAL_ADJUSTMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadDashboardManualAdjustments(): Promise<DashboardManualAdjustment[]> {
  const cached = readLocalAdjustments();
  if (cached.length > 0) return cached;
  try {
    const raw = await idbGet(DASHBOARD_MANUAL_ADJUSTMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return cached;
  }
}

export function appendDashboardManualAdjustment(
  adjustment: DashboardManualAdjustment
): Promise<void> {
  appendQueue = appendQueue.then(async () => {
    const current = await loadDashboardManualAdjustments();
    const next = [...current, adjustment];
    await storageSetItemChecked(DASHBOARD_MANUAL_ADJUSTMENTS_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('att-dashboard-manual-adjustments-updated'));
    }
  });
  return appendQueue;
}
