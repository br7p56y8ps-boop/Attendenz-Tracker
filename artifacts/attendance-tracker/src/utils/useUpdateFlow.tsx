import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createSnapshot, getSnapshots } from '@/utils/snapshotUtils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { storageRemoveItem, storageSetItem } from '@/lib/idb';

function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1; if (x < y) return -1;
  }
  return 0;
}

export function useUpdateFlow() {
  const [installedVersion] = useState<string>(() => {
    const stored = localStorage.getItem('att_app_version') || APP_VERSION;
    if (compareVersions(APP_VERSION, stored) > 0) { localStorage.setItem('att_app_version', APP_VERSION); return APP_VERSION; }
    return stored;
  });
  const [pwaReady, setPwaReady] = useState<boolean>(() => localStorage.getItem('att_pwa_update_ready') === 'true');
  const [serverVersion, setServerVersion] = useState<string>(() => localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION);
  const [serverSummary, setServerSummary] = useState<string>(() => localStorage.getItem('att_pwa_update_summary') || '');
  useEffect(() => {
    const onReady = () => setPwaReady(true);
    const onCleared = () => {
      setPwaReady(false);
      setServerVersion(APP_VERSION);
      setServerSummary('');
    };
    window.addEventListener('attendenz:update-ready', onReady);
    window.addEventListener('attendenz:update-cleared', onCleared);
    return () => {
      window.removeEventListener('attendenz:update-ready', onReady);
      window.removeEventListener('attendenz:update-cleared', onCleared);
    };
  }, []);
  const isUpdateAvailable = compareVersions(serverVersion, installedVersion) > 0 || (pwaReady && compareVersions(serverVersion, installedVersion) >= 0);

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const [updatePhase, setUpdatePhase] = useState<'none' | 'backing' | 'updating'>('none');
  const [dots, setDots] = useState(1);
  useEffect(() => { if (updatePhase === 'none') return; const t = window.setInterval(() => setDots(d => (d % 3) + 1), 450); return () => window.clearInterval(t); }, [updatePhase]);

  const applyUpdate = async (withBackup: boolean) => {
    await Promise.all([
      storageRemoveItem('att_pwa_update_ready'),
      storageRemoveItem('att_pwa_latest_version'),
      storageRemoveItem('att_pwa_update_summary'),
      storageSetItem('att_just_updated', 'true'),
      storageRemoveItem('att_has_seen_welcome_v1'),
      storageRemoveItem('att_app_version'),
    ]);
    if (withBackup) {
      setUpdatePhase('backing');
      createSnapshot('Pre-Update Backup');
      const snaps = getSnapshots();
      if (snaps.length > 0 && snaps[0].label.startsWith('Pre-Update Backup')) localStorage.setItem('att_pending_update_restore', snaps[0].id);
      await new Promise(r => setTimeout(r, 5500));
    }
    setUpdatePhase('updating');
    const MIN = 6500; const start = Date.now();
    try { const applyPwa = (window as any).attendenzApplyPwaUpdate; if (applyPwa) await applyPwa(); } catch {}
    const elapsed = Date.now() - start;
    if (elapsed < MIN) await new Promise(r => setTimeout(r, MIN - elapsed));
    window.location.href = import.meta.env.BASE_URL || '/';
  };

  return { isUpdateAvailable, serverVersion, serverSummary, online, updatePhase, dots, applyUpdate };
}

export const UpdateOverlay = ({ phase, dots }: { phase: 'none' | 'backing' | 'updating'; dots: number }) => (
  <AnimatePresence>
    {phase !== 'none' && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-end justify-center p-4">
        <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 w-full max-w-xs max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] flex flex-col items-center gap-4">
          {phase === 'backing' ? (<>
            <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
            <p className="text-sm font-extrabold text-foreground">Backing Up your Data{'.'.repeat(dots)}</p>
            <p className="text-[10px] text-muted-foreground text-center">Securing your attendance records & preferences...</p>
          </>) : (<>
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-sm font-extrabold text-foreground">Just Updating{'.'.repeat(dots)}</p>
            <p className="text-[10px] text-muted-foreground text-center">Hold on — the new version is being installed. The app reloads at <strong className="text-foreground">Welcome Screen</strong></p>
          </>)}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export const UpdateModal = ({ open, serverVersion, summary, onRemind, onUpdate }: {
  open: boolean; serverVersion: string; summary: string; onRemind: () => void; onUpdate: (b: boolean) => void;
}) => (
  <AnimatePresence>
    {open && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end justify-center p-4">
        <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-w-sm max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20"><span className="text-amber-500 font-extrabold">↑</span></div>
            <div className="text-left">
              <h3 className="text-base font-bold text-foreground leading-tight">Update to <span className="text-emerald-400">v{serverVersion}</span></h3>
              <p className="text-[11px] text-muted-foreground font-medium">A new version is available</p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed text-left">{summary || 'Bug fixes and refinements are ready to install.'}</p>
          <div className="flex flex-col gap-2 pt-1">
            <button type="button" onClick={() => onUpdate(true)} className="action-button action-button--transfer w-full">Backup & Update</button>
            <button type="button" onClick={onRemind} className="action-button action-button--neutral w-full">Remind Later</button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
