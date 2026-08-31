import { storageSetItem, storageRemoveItemChecked, storageCommitChecked, flushStorageWrites } from './idb';

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

const SHARED_ALIAS_KEYS = new Set<string>([
  'att_subject_mode',
  'attendance_tracker_preferred_percentage',
  'att_curriculum_status',
]);
const PRESET_ALIAS_KEYS = new Set<string>([
  'att_user_added_subjects',
  'att_preset_timetable',
  'att_preset_ward_schedule',
  'att_preset_subject_totals',
  'att_preset_subject_renames',
  'att_preset_ward_renames',
  'attendance_tracker_subjects_preset',
  'attendance_tracker_ward_preset',
  'attendance_tracker_home_selections_preset',
  'attendance_tracker_finished_map_preset',
]);
const CUSTOM_ALIAS_KEYS = new Set<string>([
  'att_custom_subjects',
  'att_custom_wards',
  'attendance_tracker_subjects_custom',
  'attendance_tracker_ward_custom',
  'attendance_tracker_home_selections_custom',
  'attendance_tracker_finished_map_custom',
]);

const isOwnedByKind = (key: string, kind: CurriculumKind): boolean =>
  SHARED_ALIAS_KEYS.has(key) || (kind === 'preset' ? PRESET_ALIAS_KEYS.has(key) : CUSTOM_ALIAS_KEYS.has(key));

function write(key: string, value: string): void {
  localStorage.setItem(key, value);
  void storageSetItem(key, value);
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

export function captureActiveBundle(kind?: CurriculumKind): CurriculumBundle {
  const activeKind: CurriculumKind = kind
    || (localStorage.getItem('att_subject_mode') === 'custom' ? 'custom' : 'preset');
  return captureWorkspaceBundle(activeKind);
}

function captureWorkspaceBundle(kind: CurriculumKind): CurriculumBundle {
  const data: CurriculumBundle = {};
  for (const key of ALIAS_KEYS) {
    if (!isOwnedByKind(key, kind)) continue;
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

const defaultCurriculumId = (kind: CurriculumKind): string =>
  kind === 'preset' ? 'curriculum_final_phase_5th_year' : 'curriculum_custom_routine';

export function getCurriculumForKind(kind: CurriculumKind): CurriculumRecord | null {
  const curricula = getCurricula();
  const active = getActiveCurriculum();
  if (active?.kind === kind) return active;
  return curricula.find(c => c.id === defaultCurriculumId(kind) && c.kind === kind)
    || curricula.find(c => c.kind === kind && c.status === 'active')
    || curricula.find(c => c.kind === kind)
    || null;
}

function repairPresetBundleFromLiveWorkspace(): void {
  const record = getCurricula().find(c => c.id === defaultCurriculumId('preset') && c.kind === 'preset');
  if (!record) return;
  const stored = getCurriculumBundle(record.id);
  const live = captureWorkspaceBundle('preset');
  const repaired: CurriculumBundle = { ...stored };
  let changed = false;
  for (const [key, value] of Object.entries(live)) {
    if (repaired[key] === undefined) {
      repaired[key] = value;
      changed = true;
    }
  }
  if (repaired['att_subject_mode'] !== 'preloaded') {
    repaired['att_subject_mode'] = 'preloaded';
    changed = true;
  }
  if (changed) saveCurriculumBundle(record.id, repaired);
}

export function reconcileActiveCurriculumToMode(): void {
  const kind: CurriculumKind = localStorage.getItem('att_subject_mode') === 'custom' ? 'custom' : 'preset';
  const active = getActiveCurriculum();
  const target = getCurriculumForKind(kind);
  if (!target) return;

  if (active?.kind !== kind || active.id !== target.id) {
    const live = captureWorkspaceBundle(kind);
    const targetBundle = getCurriculumBundle(target.id);
    saveCurriculumBundle(target.id, {
      ...targetBundle,
      ...live,
      'att_subject_mode': kind === 'custom' ? 'custom' : 'preloaded',
    });
    setActiveCurriculumId(target.id);
  }
}

export function syncBundleToActiveAliases(bundle: CurriculumBundle, kind?: CurriculumKind): void {
  const targetKind: CurriculumKind = kind
    || (bundle['att_subject_mode'] === 'custom' ? 'custom' : 'preset');
  for (const key of ALIAS_KEYS) {
    if (!isOwnedByKind(key, targetKind)) continue;
    const value = bundle[key];
    if (value !== undefined) write(key, value);
  }
}

function getBundleAliasChanges(bundle: CurriculumBundle, kind: CurriculumKind): { entries: Array<[string, string]>; keysToRemove: string[] } {
  const entries: Array<[string, string]> = [];
  const keysToRemove: string[] = [];
  for (const key of ALIAS_KEYS) {
    if (!isOwnedByKind(key, kind)) continue;
    const value = bundle[key];
    if (value !== undefined) entries.push([key, value]);
  }
  return { entries, keysToRemove };
}

export function setActiveCurriculumId(id: string): void {
  write(ACTIVE_CURRICULUM_KEY, id);
}

export async function clearActiveCurriculumChecked(): Promise<void> {
  await storageRemoveItemChecked(ACTIVE_CURRICULUM_KEY);
}

function buildNewCurriculum(name: string): CurriculumRecord {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Curriculum name is required.');
  const curricula = getCurricula();
  if (curricula.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A curriculum with this name already exists.');
  }
  return {
    id: makeId(),
    name: trimmed,
    status: 'active',
    kind: 'custom',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

const emptyCustomBundle = (status: 'Active' | 'Completed' = 'Active'): CurriculumBundle => ({
  'att_subject_mode': 'custom',
  'att_custom_subjects': '[]',
  'att_custom_wards': '[]',
  'attendance_tracker_subjects_custom': '{}',
  'attendance_tracker_ward_custom': '{}',
  'attendance_tracker_home_selections_custom': '{}',
  'attendance_tracker_finished_map_custom': '{}',
  'attendance_tracker_preferred_percentage': '75',
  'att_curriculum_status': status,
});

export function createCurriculum(name: string): CurriculumRecord {
  const record = buildNewCurriculum(name);
  const curricula = getCurricula();
  saveCurricula([...curricula, record]);
  saveCurriculumBundle(record.id, emptyCustomBundle());
  return record;
}

export async function createCurriculumChecked(name: string): Promise<CurriculumRecord> {
  const record = buildNewCurriculum(name);
  const existing = getCurricula();
  const curricula = [...existing, record];
  const existingPreferredPercentage = localStorage.getItem('attendance_tracker_preferred_percentage');
  const bundle = {
    ...emptyCustomBundle(),
    ...(existingPreferredPercentage !== null ? { 'attendance_tracker_preferred_percentage': existingPreferredPercentage } : {}),
  };
  const entries: Array<[string, string]> = [
    [CURRICULA_KEY, JSON.stringify(curricula)],
    [`att_curriculum_bundle_${record.id}`, JSON.stringify(bundle)],
  ];
  const existingActive = existing.find(curriculum => curriculum.status === 'active') || null;
  const activeRecord = existing.find(curriculum => curriculum.id === getActiveCurriculumId()) || null;
  const shouldEstablishWorkspace = !existingActive;
  const shouldRepairActivePointer = Boolean(existingActive && (!activeRecord || activeRecord.status !== 'active'));
  if (shouldEstablishWorkspace) {
    const aliases = getBundleAliasChanges(bundle, 'custom');
    entries.push(...aliases.entries);
    entries.push([ACTIVE_CURRICULUM_KEY, record.id]);
    await storageCommitChecked(entries, aliases.keysToRemove);
  } else {
    if (shouldRepairActivePointer) entries.push([ACTIVE_CURRICULUM_KEY, existingActive.id]);
    await storageCommitChecked(entries);
  }
  return record;
}

function buildRenamedCurricula(id: string, name: string): CurriculumRecord[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Curriculum name is required.');
  const curricula = getCurricula();
  if (!curricula.some(c => c.id === id)) throw new Error('Curriculum not found.');
  if (curricula.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A curriculum with this name already exists.');
  }
  return curricula.map(c => c.id === id ? { ...c, name: trimmed, updatedAt: nowIso() } : c);
}

export function renameCurriculum(id: string, name: string): CurriculumRecord[] {
  const updated = buildRenamedCurricula(id, name);
  saveCurricula(updated);
  return updated;
}

export async function renameCurriculumChecked(id: string, name: string): Promise<CurriculumRecord[]> {
  const updated = buildRenamedCurricula(id, name);
  await storageCommitChecked([[CURRICULA_KEY, JSON.stringify(updated)]]);
  return updated;
}

function buildCurriculumStatusUpdate(id: string, status: CurriculumStatus): CurriculumRecord[] {
  const curricula = getCurricula();
  if (!curricula.some(c => c.id === id)) throw new Error('Curriculum not found.');
  return curricula.map(c => c.id === id ? { ...c, status, updatedAt: nowIso() } : c);
}

export function setCurriculumStatus(id: string, status: CurriculumStatus): CurriculumRecord[] {
  const updated = buildCurriculumStatusUpdate(id, status);
  saveCurricula(updated);
  return updated;
}

export async function setCurriculumStatusChecked(id: string, status: CurriculumStatus): Promise<CurriculumRecord[]> {
  const updated = buildCurriculumStatusUpdate(id, status);
  await storageCommitChecked([[CURRICULA_KEY, JSON.stringify(updated)]]);
  return updated;
}

export async function completeCurriculum(id: string): Promise<{ curricula: CurriculumRecord[]; replacement: CurriculumRecord | null }> {
  const curricula = getCurricula();
  const target = curricula.find(curriculum => curriculum.id === id);
  if (!target) throw new Error('Curriculum not found.');
  const updated = curricula.map(curriculum => curriculum.id === id ? { ...curriculum, status: 'archived' as const, updatedAt: nowIso() } : curriculum);
  const completingActive = getActiveCurriculumId() === id;
  const replacement = completingActive ? updated.find(curriculum => curriculum.status === 'active') || null : null;
  const entries: Array<[string, string]> = [[CURRICULA_KEY, JSON.stringify(updated)]];
  const keysToRemove: string[] = [];

  if (completingActive) {
    if (!replacement) {
      keysToRemove.push(ACTIVE_CURRICULUM_KEY);
      keysToRemove.push(...ALIAS_KEYS.filter(key => isOwnedByKind(key, target.kind) && !SHARED_ALIAS_KEYS.has(key)));
      entries.push(['att_curriculum_status', 'Completed']);
    } else {
      const replacementBundle = {
        ...getCurriculumBundle(replacement.id),
        'att_subject_mode': replacement.kind === 'custom' ? 'custom' : 'preloaded',
        'att_curriculum_status': 'Active',
      };
      entries.push([`att_curriculum_bundle_${replacement.id}`, JSON.stringify(replacementBundle)]);
      const aliases = getBundleAliasChanges(replacementBundle, replacement.kind);
      entries.push(...aliases.entries);
      keysToRemove.push(...aliases.keysToRemove);
      entries.push([ACTIVE_CURRICULUM_KEY, replacement.id]);
    }
  }

  await storageCommitChecked(entries, keysToRemove);
  await flushStorageWrites();
  return { curricula: updated, replacement };
}

export async function deleteCurriculum(id: string): Promise<CurriculumRecord[]> {
  const target = getCurricula().find(c => c.id === id);
  if (!target) throw new Error('Curriculum not found.');
  if (target.kind === 'preset' || id === defaultCurriculumId('preset') || id === defaultCurriculumId('custom')) {
    throw new Error('Preset curricula cannot be deleted.');
  }
  const remaining = getCurricula().filter(c => c.id !== id);
  const deletingActive = getActiveCurriculumId() === id;
  const replacement = deletingActive ? remaining.find(c => c.status === 'active') || null : null;
  const entries: Array<[string, string]> = [[CURRICULA_KEY, JSON.stringify(remaining)]];
  const keysToRemove = [`att_curriculum_bundle_${id}`];

  if (deletingActive) {
    if (!replacement) {
      keysToRemove.push(ACTIVE_CURRICULUM_KEY);
      keysToRemove.push(...ALIAS_KEYS.filter(key => isOwnedByKind(key, target.kind) && !SHARED_ALIAS_KEYS.has(key)));
      entries.push(['att_curriculum_status', 'Completed']);
    } else {
      const replacementBundle = {
        ...getCurriculumBundle(replacement.id),
        'att_subject_mode': replacement.kind === 'custom' ? 'custom' : 'preloaded',
        'att_curriculum_status': 'Active',
      };
      entries.push([`att_curriculum_bundle_${replacement.id}`, JSON.stringify(replacementBundle)]);
      const aliases = getBundleAliasChanges(replacementBundle, replacement.kind);
      entries.push(...aliases.entries);
      keysToRemove.push(...aliases.keysToRemove);
      entries.push([ACTIVE_CURRICULUM_KEY, replacement.id]);
    }
  }

  await storageCommitChecked(entries, keysToRemove);
  await flushStorageWrites();
  return remaining;
}

export async function activateCurriculum(id: string): Promise<void> {
  const curricula = getCurricula();
  const target = curricula.find(c => c.id === id);
  if (!target) throw new Error('Curriculum not found.');
  const activeCount = curricula.filter(c => c.status === 'active').length;
  if (target.status === 'archived' && activeCount >= 2) {
    throw new Error('You already have the maximum number of Active Curricula. Mark one Complete before reopening another.');
  }
  const currentId = getActiveCurriculumId();
  const currentKind: CurriculumKind = localStorage.getItem('att_subject_mode') === 'custom' ? 'custom' : 'preset';
  const current = currentId ? curricula.find(c => c.id === currentId) : null;
  const entries: Array<[string, string]> = [];
  const keysToRemove: string[] = [];
  if (current && current.id !== id && current.kind === currentKind) {
    entries.push([`att_curriculum_bundle_${current.id}`, JSON.stringify(captureActiveBundle(currentKind))]);
  } else if (current && current.kind !== currentKind) {
    const matching = getCurriculumForKind(currentKind);
    if (matching && matching.id !== id) entries.push([`att_curriculum_bundle_${matching.id}`, JSON.stringify(captureActiveBundle(currentKind))]);
  }
  const next = {
    ...getCurriculumBundle(id),
    'att_subject_mode': target.kind === 'custom' ? 'custom' : 'preloaded',
    'att_curriculum_status': 'Active',
  };
  entries.push([`att_curriculum_bundle_${id}`, JSON.stringify(next)]);
  const aliases = getBundleAliasChanges(next, target.kind);
  entries.push(...aliases.entries);
  keysToRemove.push(...aliases.keysToRemove);
  entries.push([CURRICULA_KEY, JSON.stringify(curricula.map(c => c.id === id ? { ...c, status: 'active' as const, updatedAt: nowIso() } : c))]);
  entries.push([ACTIVE_CURRICULUM_KEY, id]);
  await storageCommitChecked(entries, keysToRemove);
  await flushStorageWrites();
}

export function ensureCurriculumMigration(): void {
  const migrationComplete = localStorage.getItem(CURRICULUM_MIGRATION_KEY) === 'true';
  const existing = getCurricula();
  const active = getActiveCurriculum();
  if (existing.length > 0) {
    if (!active) {
      const activeCandidate = existing.find(curriculum => curriculum.status === 'active');
      if (activeCandidate) setActiveCurriculumId(activeCandidate.id);
    }
    repairPresetBundleFromLiveWorkspace();
    if (getActiveCurriculum()) reconcileActiveCurriculumToMode();
    if (!migrationComplete) write(CURRICULUM_MIGRATION_KEY, 'true');
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
  const currentBundle = captureActiveBundle(currentMode === 'custom' ? 'custom' : 'preset');
  const presetBundle: CurriculumBundle = currentMode === 'preloaded'
    ? { ...currentBundle }
    : captureWorkspaceBundle('preset');
  const customBundle: CurriculumBundle = currentMode === 'custom'
    ? { ...currentBundle }
    : captureWorkspaceBundle('custom');

  const currentWorkspace = currentMode === 'custom' ? customBundle : presetBundle;
  for (const key of ['attendance_tracker_preferred_percentage', 'att_curriculum_status']) {
    if (currentBundle[key] !== undefined) currentWorkspace[key] = currentBundle[key];
  }
  presetBundle['att_subject_mode'] = 'preloaded';
  customBundle['att_subject_mode'] = 'custom';
  if (!customBundle['att_custom_subjects']) customBundle['att_custom_subjects'] = '[]';
  if (!customBundle['att_custom_wards']) customBundle['att_custom_wards'] = '[]';
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
  reconcileActiveCurriculumToMode();
}

export const CURRICULUM_KEYS = { CURRICULA_KEY, ACTIVE_CURRICULUM_KEY, CURRICULUM_MIGRATION_KEY };
export const CURRICULUM_ALIAS_KEYS = [...ALIAS_KEYS];
