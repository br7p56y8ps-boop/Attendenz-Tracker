import { storageRemoveItem, storageSetItem } from '@/lib/idb';

export type CurriculumStatus = 'active' | 'archived';
export type CurriculumKind = 'preset' | 'custom';

export interface CurriculumRecord {
  id: string;
  name: string;
  status: CurriculumStatus;
  kind: CurriculumKind;
  createdAt: string;
  updatedAt: string;
}

export type CurriculumBundle = Record<string, string>;

const CURRICULA_KEY = 'att_curricula_v1';
const ACTIVE_CURRICULUM_KEY = 'att_active_curriculum_id_v1';
const CURRICULUM_MIGRATION_KEY = 'att_curriculum_migration_v1_done';

const ALIAS_KEYS = [
  'att_subject_mode',
  'att_custom_subjects',
  'att_custom_wards',
  'att_user_added_subjects',
  'att_preset_timetable',
  'att_preset_ward_schedule',
  'att_preset_subject_totals',
  'att_preset_subject_renames',
  'att_preset_ward_renames',
  'attendance_tracker_subjects',
  'attendance_tracker_ward',
  'attendance_tracker_home_selections',
  'attendance_tracker_finished_map',
  'attendance_tracker_subjects_preset',
  'attendance_tracker_ward_preset',
  'attendance_tracker_home_selections_preset',
  'attendance_tracker_finished_map_preset',
  'attendance_tracker_subjects_custom',
  'attendance_tracker_ward_custom',
  'attendance_tracker_home_selections_custom',
  'attendance_tracker_finished_map_custom',
  'attendance_tracker_preferred_percentage',
  'att_curriculum_status',
] as const;

const nowIso = () => new Date().toISOString();
const makeId = () => `curriculum_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

function write(key: string, value: string): void {
  localStorage.setItem(key, value);
  storageSetItem(key, value);
}

function remove(key: string): void {
  localStorage.removeItem(key);
  storageRemoveItem(key);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function getCurricula(): CurriculumRecord[] {
  return readJson<CurriculumRecord[]>(CURRICULA_KEY, []);
}

export function saveCurricula(curricula: CurriculumRecord[]): void {
  write(CURRICULA_KEY, JSON.stringify(curricula));
}

export function getActiveCurriculumId(): string | null {
  return localStorage.getItem(ACTIVE_CURRICULUM_KEY);
}

export function getActiveCurriculum(): CurriculumRecord | null {
  const id = getActiveCurriculumId();
  return getCurricula().find(c => c.id === id) || null;
}

export function getActiveCurriculumName(): string {
  return getActiveCurriculum()?.name || '5th Year / Final Phase';
}

export function captureActiveBundle(): CurriculumBundle {
  const data: CurriculumBundle = {};
  for (const key of ALIAS_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

export function saveCurriculumBundle(id: string, bundle: CurriculumBundle): void {
  write(`att_curriculum_bundle_${id}`, JSON.stringify(bundle));
}

export function getCurriculumBundle(id: string): CurriculumBundle {
  return readJson<CurriculumBundle>(`att_curriculum_bundle_${id}`, {});
}

export function syncBundleToActiveAliases(bundle: CurriculumBundle): void {
  for (const key of ALIAS_KEYS) {
    const value = bundle[key];
    if (value === undefined) remove(key);
    else write(key, value);
  }
}

export function setActiveCurriculumId(id: string): void {
  write(ACTIVE_CURRICULUM_KEY, id);
}

export function createCurriculum(name: string): CurriculumRecord {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Curriculum name is required.');
  const curricula = getCurricula();
  if (curricula.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A curriculum with this name already exists.');
  }
  const record: CurriculumRecord = {
    id: makeId(),
    name: trimmed,
    status: 'active',
    kind: 'custom',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  saveCurricula([...curricula, record]);
  saveCurriculumBundle(record.id, {
    'att_subject_mode': 'custom',
    'att_custom_subjects': '[]',
    'att_custom_wards': '[]',
    'att_user_added_subjects': '[]',
    'att_preset_timetable': '{}',
    'att_preset_ward_schedule': '[]',
    'att_preset_subject_totals': '{}',
    'att_preset_subject_renames': '{}',
    'att_preset_ward_renames': '{}',
    'attendance_tracker_subjects_custom': '{}',
    'attendance_tracker_ward_custom': '{}',
    'attendance_tracker_home_selections_custom': '{}',
    'attendance_tracker_finished_map_custom': '{}',
    'attendance_tracker_preferred_percentage': '75',
    'att_curriculum_status': 'Active',
  });
  return record;
}

export function renameCurriculum(id: string, name: string): CurriculumRecord[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Curriculum name is required.');
  const curricula = getCurricula();
  if (curricula.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A curriculum with this name already exists.');
  }
  const updated = curricula.map(c => c.id === id ? { ...c, name: trimmed, updatedAt: nowIso() } : c);
  saveCurricula(updated);
  return updated;
}

export function setCurriculumStatus(id: string, status: CurriculumStatus): CurriculumRecord[] {
  const updated = getCurricula().map(c => c.id === id ? { ...c, status, updatedAt: nowIso() } : c);
  saveCurricula(updated);
  return updated;
}

export function activateCurriculum(id: string): void {
  const target = getCurricula().find(c => c.id === id);
  if (!target) throw new Error('Curriculum not found.');
  const currentId = getActiveCurriculumId();
  if (currentId) saveCurriculumBundle(currentId, captureActiveBundle());
  const next = getCurriculumBundle(id);
  setActiveCurriculumId(id);
  syncBundleToActiveAliases(next);
  const curricula = getCurricula().map(c => c.id === id ? { ...c, status: 'active' as const, updatedAt: nowIso() } : c);
  saveCurricula(curricula);
}

export function ensureCurriculumMigration(): void {
  if (localStorage.getItem(CURRICULUM_MIGRATION_KEY) === 'true' && getActiveCurriculum()) return;

  const existing = getCurricula();
  if (existing.length > 0 && getActiveCurriculumId()) {
    write(CURRICULUM_MIGRATION_KEY, 'true');
    return;
  }

  const timestamp = nowIso();
  const preset: CurriculumRecord = {
    id: 'curriculum_final_phase_5th_year',
    name: '5th Year / Final Phase',
    status: 'active',
    kind: 'preset',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const custom: CurriculumRecord = {
    id: 'curriculum_custom_routine',
    name: 'My Custom Routine',
    status: 'active',
    kind: 'custom',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const currentMode = localStorage.getItem('att_subject_mode') === 'custom' ? 'custom' : 'preloaded';
  const currentBundle = captureActiveBundle();
  const presetBundle: CurriculumBundle = {};
  const customBundle: CurriculumBundle = {};

  for (const key of ALIAS_KEYS) {
    const value = currentBundle[key];
    if (value === undefined) continue;
    if (key.endsWith('_custom') || key === 'att_custom_subjects' || key === 'att_custom_wards') customBundle[key] = value;
    else presetBundle[key] = value;
  }

  const currentWorkspace = currentMode === 'custom' ? customBundle : presetBundle;
  for (const key of ['attendance_tracker_preferred_percentage', 'att_curriculum_status']) {
    if (currentBundle[key] !== undefined) currentWorkspace[key] = currentBundle[key];
  }
  presetBundle['att_subject_mode'] = 'preloaded';
  customBundle['att_subject_mode'] = 'custom';
  if (!customBundle['att_custom_subjects']) customBundle['att_custom_subjects'] = '[]';
  if (!customBundle['att_custom_wards']) customBundle['att_custom_wards'] = '[]';
  if (!customBundle['att_user_added_subjects']) customBundle['att_user_added_subjects'] = '[]';
  if (!customBundle['attendance_tracker_subjects_custom']) customBundle['attendance_tracker_subjects_custom'] = '{}';
  if (!customBundle['attendance_tracker_ward_custom']) customBundle['attendance_tracker_ward_custom'] = '{}';
  if (!customBundle['attendance_tracker_home_selections_custom']) customBundle['attendance_tracker_home_selections_custom'] = '{}';
  if (!customBundle['attendance_tracker_finished_map_custom']) customBundle['attendance_tracker_finished_map_custom'] = '{}';

  // The current mode's complete alias bundle is authoritative for its workspace.
  if (currentMode === 'custom') {
    saveCurriculumBundle(custom.id, customBundle);
    saveCurriculumBundle(preset.id, presetBundle);
    setActiveCurriculumId(custom.id);
  } else {
    saveCurriculumBundle(preset.id, presetBundle);
    saveCurriculumBundle(custom.id, customBundle);
    setActiveCurriculumId(preset.id);
  }
  saveCurricula([preset, custom]);
  write(CURRICULUM_MIGRATION_KEY, 'true');
}

export const CURRICULUM_KEYS = { CURRICULA_KEY, ACTIVE_CURRICULUM_KEY, CURRICULUM_MIGRATION_KEY };
export const CURRICULUM_ALIAS_KEYS = [...ALIAS_KEYS];
