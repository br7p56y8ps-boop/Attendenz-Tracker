import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createSnapshot, getSnapshots } from '@/utils/snapshotUtils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { storageRemoveItem, storageSetItem } from '@/lib/idb';
import { notifyUpdateAvailable } from '@/lib/webPush';
import { cn } from '@/lib/utils';

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
    localStorage.setItem('att_app_version', APP_VERSION);
    return APP_VERSION;
  });
  const [, setPwaReady] = useState<boolean>(() => localStorage.getItem('att_pwa_update_ready') === 'true');
  const [serverVersion, setServerVersion] = useState<string>(() => localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION);
  const [serverSummary, setServerSummary] = useState<string>(() => localStorage.getItem('att_pwa_update_summary') || '');
  useEffect(() => {
    const pendingVersion = localStorage.getItem('att_pwa_latest_version');
    const pendingSummary = localStorage.getItem('att_pwa_update_summary') || '';
    if (localStorage.getItem('att_pwa_update_ready') === 'true' && pendingVersion) {
      setPwaReady(true);
      setServerVersion(pendingVersion);
      setServerSummary(pendingSummary);
    }
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
  const isUpdateAvailable = compareVersions(serverVersion, installedVersion) > 0;

  useEffect(() => {
    if (!isUpdateAvailable || compareVersions(serverVersion, installedVersion) <= 0) return;
    const sentKey = `att_update_available_notified_${serverVersion}`;
    if (localStorage.getItem(sentKey) === 'true') return;
    void notifyUpdateAvailable(serverVersion).then(sent => {
      if (sent) localStorage.setItem(sentKey, 'true');
    });
  }, [isUpdateAvailable, serverVersion, installedVersion]);

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const [updatePhase, setUpdatePhase] = useState<'none' | 'backing' | 'updating'>('none');
  const [dots, setDots] = useState(1);
  const [progressComplete, setProgressComplete] = useState(false);
  useEffect(() => { if (updatePhase === 'none') return; const t = window.setInterval(() => setDots(d => (d % 3) + 1), 450); return () => window.clearInterval(t); }, [updatePhase]);
  useEffect(() => { if (updatePhase === 'none') setProgressComplete(false); }, [updatePhase]);

  const applyUpdate = async (withBackup: boolean) => {
    if (withBackup) {
      setUpdatePhase('backing');
      const snapshotCreated = await createSnapshot('Pre-Update Backup');
      if (!snapshotCreated) {
        setUpdatePhase('none');
        return;
      }
      const snaps = getSnapshots();
      if (snaps.length > 0 && snaps[0].label.startsWith('Pre-Update Backup')) {
        await storageSetItem('att_pending_update_restore', snaps[0].id);
      }
      setProgressComplete(true);
    }

    await Promise.all([
      storageRemoveItem('att_pwa_update_ready'),
      storageRemoveItem('att_pwa_latest_version'),
      storageRemoveItem('att_pwa_update_summary'),
      storageSetItem('att_just_updated', 'true'),
      storageRemoveItem('att_has_seen_welcome_v1'),
      storageRemoveItem('att_app_version'),
    ]);
    if (withBackup) {
      await new Promise(r => setTimeout(r, 5500));
    }
    setUpdatePhase('updating');
    const MIN = 6500; const start = Date.now();
    let applied = false;
    try {
      const applyPwa = (window as any).attendenzApplyPwaUpdate as (() => Promise<boolean>) | undefined;
      applied = applyPwa ? (await applyPwa()) !== false : false;
    } catch {
      applied = false;
    }
    if (!applied) {
      setUpdatePhase('none');
      return;
    }
    setProgressComplete(true);
    const elapsed = Date.now() - start;
    if (elapsed < MIN) await new Promise(r => setTimeout(r, MIN - elapsed));
    window.location.href = import.meta.env.BASE_URL || '/';
  };

  return { isUpdateAvailable, serverVersion, serverSummary, online, updatePhase, dots, progressComplete, applyUpdate };
}

export const UpdateProgressSlider = ({ phase, complete = false }: { phase: 'backing' | 'updating'; complete?: boolean }) => {
  const duration = phase === 'backing' ? 4000 : 8000;
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const timedProgress = Math.min(94, (elapsed / duration) * 94);
      setProgress(complete ? 100 : timedProgress);
      if (complete) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [phase, duration, complete]);
  return (
    <div className={cn('jelly-slider w-full', phase === 'backing' ? 'jelly-slider--backing' : 'jelly-slider--updating')} role="progressbar" aria-label={`${phase === 'backing' ? 'Backup' : 'Update'} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <div className="jelly-slider__track">
        <div className="jelly-slider__well" />
        <div className="jelly-slider__fill" style={{ width: `calc(${Math.max(0, progress)}% - 1rem)` }} />
        <div className="jelly-slider__handle" style={{ left: `clamp(2.25rem, ${Math.max(0, progress)}%, calc(100% - 2.25rem))` }} aria-hidden="true" />
        <div className="jelly-slider__value">{Math.round(progress)}%</div>
      </div>
    </div>
  );
};

export const UpdateOverlay = ({ phase, dots, progressComplete }: { phase: 'none' | 'backing' | 'updating'; dots: number; progressComplete?: boolean }) => (
  <AnimatePresence>
    {phase !== 'none' && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-end justify-center p-4">
        <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 w-full max-w-xs max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] flex flex-col items-center gap-4">
          {phase === 'backing' ? (<>
            <UpdateProgressSlider phase="backing" complete={progressComplete} />
            <p className="text-sm font-extrabold text-foreground">Backing Up your Data{'.'.repeat(dots)}</p>
            <p className="text-[10px] text-muted-foreground text-center">Securing your attendance records & preferences...</p>
          </>) : (<>
            <UpdateProgressSlider phase="updating" complete={progressComplete} />
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
