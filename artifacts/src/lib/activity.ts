import { idbGet, idbSet } from '@/lib/idb';

export type DashboardActivityKind = 'attendance' | 'missed' | 'edit' | 'slot' | 'vacation' | 'percentage' | 'neutral';
export interface DashboardActivityItem {
  id: string;
  text: string;
  timestamp: number;
  kind: DashboardActivityKind;
}

function normalizeActivityCategory(category: string): 'Lecture' | 'Integrated' | 'Ward' | 'SGT' {
  if (/small group teaching|sgt/i.test(category)) return 'SGT';
  if (/clinical rotation|ward/i.test(category)) return 'Ward';
  if (/integrated/i.test(category)) return 'Integrated';
  return 'Lecture';
}

export function formatAttendanceActivity(subject: string, category: string, status: 'Attended' | 'Bunked' | 'Off'): string {
  return `Marked ${subject} (${normalizeActivityCategory(category)}) as ${status}`;
}

export function formatManualAttendanceDelta(subject: string, category: string, type: 'Attended' | 'Bunked', delta: number): string {
  const signedDelta = delta > 0 ? `+${delta}` : String(delta);
  return `Updated ${subject} (${normalizeActivityCategory(category)}) Data to ${type} (${signedDelta} class)`;
}

let activityQueue: Promise<void> = Promise.resolve();

const uniqueActivityId = (timestamp: number) => `activity-${timestamp}-${Math.random().toString(36).slice(2, 10)}`;

export function recordDashboardActivity(text: string, kind: DashboardActivityKind, timestamp = Date.now()): Promise<boolean> {
  const task = activityQueue.then(async () => {
    try {
      const raw = await idbGet('att_dashboard_activity_v1');
      const entries = raw ? JSON.parse(raw) as DashboardActivityItem[] : [];
      const item: DashboardActivityItem = { id: uniqueActivityId(timestamp), text, kind, timestamp };
      const merged = [item, ...entries]
        .filter(entry => Number.isFinite(entry.timestamp) && Date.now() - entry.timestamp < 48 * 60 * 60 * 1000)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50);
      await idbSet('att_dashboard_activity_v1', JSON.stringify(merged));
      return true;
    } catch (error) {
      console.error('Dashboard activity persistence failed.', error);
      import('sonner').then(({ toast }) => toast.error('Could not save this activity to Today’s Activity.'));
      return false;
    }
  });
  activityQueue = task.then(() => undefined, () => undefined);
  return task;
}

export function mergeDashboardActivities(items: DashboardActivityItem[]): Promise<DashboardActivityItem[]> {
  const task = activityQueue.then(async () => {
    try {
      const raw = await idbGet('att_dashboard_activity_v1');
      const stored = raw ? JSON.parse(raw) as DashboardActivityItem[] : [];
      const merged = [...stored, ...items]
        .filter(entry => Number.isFinite(entry.timestamp) && Date.now() - entry.timestamp < 48 * 60 * 60 * 1000)
        .sort((a, b) => b.timestamp - a.timestamp)
        .filter((entry, index, all) => all.findIndex(candidate => candidate.id === entry.id) === index)
        .slice(0, 40);
      await idbSet('att_dashboard_activity_v1', JSON.stringify(merged));
      return merged;
    } catch (error) {
      console.error('Dashboard activity merge failed.', error);
      import('sonner').then(({ toast }) => toast.error('Could not refresh Today’s Activity.'));
      return [];
    }
  });
  activityQueue = task.then(() => undefined, () => undefined);
  return task;
}
