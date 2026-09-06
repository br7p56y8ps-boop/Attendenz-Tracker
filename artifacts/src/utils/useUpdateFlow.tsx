import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createSnapshot, getSnapshots } from '@/utils/snapshotUtils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { storageSetItemChecked, storageRemoveItemChecked, storageCommitChecked } from '@/lib/idb';
import { notifyUpdateAvailable } from '@/lib/webPush';

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

  const [updatePhase, setUpdatePhase] = useState<'none' | 'backing' | 'downloading' | 'installing' | 'completed'>('none');
  const [progressComplete, setProgressComplete] = useState(false);
  useEffect(() => { if (updatePhase === 'none') setProgressComplete(false); }, [updatePhase]);

  const applyUpdate = async (withBackup: boolean) => {
    if (withBackup) {
      setUpdatePhase('backing');
      const backupStarted = Date.now();
      const snapshotCreated = await createSnapshot('Pre-Update Backup');
      if (!snapshotCreated) {
        setUpdatePhase('none');
        return;
      }
      const snaps = getSnapshots();
      if (snaps.length > 0 && snaps[0].label.startsWith('Pre-Update Backup')) {
        try {
          await storageSetItemChecked('att_pending_update_restore', snaps[0].id);
        } catch {
          setUpdatePhase('none');
          return;
        }
      }
      await new Promise(r => setTimeout(r, Math.max(0, 8000 - (Date.now() - backupStarted))));
      setProgressComplete(true);
      await new Promise(r => setTimeout(r, 350));
    }

    try {
      await storageCommitChecked(
        [['att_just_updated', 'true']],
        ['att_has_seen_welcome_v1', 'att_app_version'],
      );
    } catch {
      setUpdatePhase('none');
      return;
    }
    setProgressComplete(false);
    setUpdatePhase('downloading');
    let applied = false;
    try {
      const applyPwa = (window as any).attendenzApplyPwaUpdate as ((onPhase: (phase: 'installing' | 'completed') => void) => Promise<boolean>) | undefined;
      applied = applyPwa ? (await applyPwa(phase => {
        if (phase === 'installing') {
          setProgressComplete(false);
          setUpdatePhase('installing');
        } else {
          setProgressComplete(true);
          setUpdatePhase('completed');
        }
      })) !== false : false;
    } catch {
      applied = false;
    }
    if (!applied) {
      await storageRemoveItemChecked('att_just_updated').catch(() => undefined);
      setUpdatePhase('none');
      return;
    }
    try {
      await Promise.all([
        storageRemoveItemChecked('att_pwa_update_ready'),
        storageRemoveItemChecked('att_pwa_latest_version'),
        storageRemoveItemChecked('att_pwa_update_summary'),
      ]);
    } catch {
      setUpdatePhase('none');
      return;
    }
    await new Promise(r => setTimeout(r, 1200));
    window.location.href = import.meta.env.BASE_URL || '/';
  };

  return { isUpdateAvailable, serverVersion, serverSummary, online, updatePhase, progressComplete, applyUpdate };
}

export const UpdateProgressSlider = ({ phase, complete = false }: { phase: 'backing' | 'downloading' | 'installing' | 'completed'; complete?: boolean }) => {
  const duration = phase === 'backing' ? 8000 : 5000;
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
    <div className="release-progress flex w-full flex-col items-center justify-center text-center">
      <div className="release-progress__steps flex items-center justify-center" role="progressbar" aria-label="Update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="relative h-24 w-24" aria-hidden="true"><svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" /><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-primary transition-all duration-300" strokeDasharray={264} strokeDashoffset={264 - (264 * Math.max(0, progress)) / 100} /></svg><span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-foreground">{Math.round(progress)}%</span></div>
      </div>
      <p className="release-progress__label mt-2 text-xs font-bold text-foreground">{phase === 'completed' ? 'Completed' : complete && phase === 'backing' ? 'Backup complete' : phase === 'backing' ? 'Backing Up…' : phase === 'downloading' ? 'Downloading Updates…' : 'Installing…'}</p>
    </div>
  );
};

export const UpdateOverlay = ({ phase, progressComplete }: { phase: 'none' | 'backing' | 'downloading' | 'installing' | 'completed'; progressComplete?: boolean }) => (
  <AnimatePresence>
    {phase !== 'none' && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
        <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="modal-sheet-content flex w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl border border-border/80 bg-card p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
          <UpdateProgressSlider phase={phase} complete={progressComplete} />
          <p className="text-[10px] text-muted-foreground">{phase === 'backing' ? 'Securing your attendance records & preferences…' : phase === 'completed' ? 'The app will load the Welcome Screen shortly.' : 'Please keep the app open while the update completes.'}</p>
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[120] flex items-end justify-center p-4">
        <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="modal-sheet-content bg-card backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-w-sm max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4" onClick={e => e.stopPropagation()}>
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
