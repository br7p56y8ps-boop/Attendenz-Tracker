import { lazy, Suspense, useEffect, useState } from 'react';
import { applyThemePreference, readThemePreference } from '@/lib/theme';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AttendanceProvider } from '@/contexts/AttendanceContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CustomDataProvider, useCustomData } from '@/contexts/CustomDataContext';
import { initStorageAndMigrate, STORAGE_ERROR_EVENT, flushStorageWrites, storageRemoveItem, storageSetItem } from '@/lib/idb';
import { ensureCurriculumMigration } from '@/lib/curriculumStore';
import { WhatsNewPopup } from '@/components/WhatsNewPopup';
import { restoreSnapshot } from '@/utils/snapshotUtils';
import { useUpdateFlow, UpdateModal, UpdateOverlay } from '@/utils/useUpdateFlow';
import { ReminderSyncProvider } from '@/lib/webPushSync';
import { notifyUpdateCompleted } from '@/lib/webPush';
import { APP_VERSION } from '@/lib/appVersion';
const WelcomeVideoScreen = lazy(() => import('@/components/video/WelcomeVideoScreen'));
const Home = lazy(() => import('@/pages/Home'));
const Subjects = lazy(() => import('@/pages/Subjects'));
const Manage = lazy(() => import('@/pages/Manage'));
const Timetable = lazy(() => import('@/pages/Timetable'));
const Settings = lazy(() => import('@/pages/Settings'));
const Login = lazy(() => import('@/pages/Login'));
const SetupScreen = lazy(() => import('@/pages/SetupScreen'));
const NotFound = lazy(() => import('@/pages/not-found'));

const PageFallback = () => <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;

const HAS_SEEN_WELCOME_KEY = 'att_has_seen_welcome_v1';

function AuthGate() {
  const { isLoggedIn } = useAuth();
  const { setupDone } = useCustomData();
  const { isUpdateAvailable, online, serverVersion, serverSummary, updatePhase, dots, applyUpdate } = useUpdateFlow();
  const [gateDismissed, setGateDismissed] = useState<boolean>(() => sessionStorage.getItem('att_update_gate_dismissed') === 'true');

  if (!isLoggedIn) return <Suspense fallback={<PageFallback />}><Login /></Suspense>;
  if (!setupDone) return <Suspense fallback={<PageFallback />}><SetupScreen /></Suspense>;

  // Pre-Home gate: block BEFORE Home renders (not an overlay on Home)
  const showGate = isUpdateAvailable && online && !gateDismissed;

  return (
    <>
      <WhatsNewPopup />
      {showGate ? (
        <>
          <UpdateModal
            open
            serverVersion={serverVersion}
            summary={serverSummary}
            onRemind={() => { sessionStorage.setItem('att_update_gate_dismissed', 'true'); setGateDismissed(true); }}
            onUpdate={(b) => applyUpdate(b)}
          />
          <UpdateOverlay phase={updatePhase} dots={dots} />
        </>
      ) : (
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/subjects" component={Subjects} />
            <Route path="/add-new" component={Manage} />
            <Route path="/calendar" component={Timetable} />
            <Route path="/account" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      )}
    </>
  );
}

function MainAppFlow() {
  const [arrivedAfterUpdate] = useState<boolean>(() => localStorage.getItem('att_just_updated') === 'true');
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    const justUpdated = localStorage.getItem('att_just_updated') === 'true';
    const hasSeenWelcome = localStorage.getItem(HAS_SEEN_WELCOME_KEY) === 'true';
    return justUpdated || !hasSeenWelcome;
  });

  if (showWelcome) {
    return (
      <Suspense fallback={<PageFallback />}>
      <WelcomeVideoScreen
        onBeginExit={() => {
          // Do not clear the update gate before a pending backup restore completes.
          const pendingRestore = localStorage.getItem('att_pending_update_restore');
          const justUpdated = localStorage.getItem('att_just_updated') === 'true';
          if (!pendingRestore) {
            storageSetItem(HAS_SEEN_WELCOME_KEY, 'true');
            if (justUpdated) {
              storageRemoveItem('att_pwa_update_ready');
              storageRemoveItem('att_pwa_latest_version');
              storageRemoveItem('att_pwa_update_summary');
            }
            storageRemoveItem('att_just_updated');
          }
        }}
        onComplete={async () => {
          const pendingRestoreId = localStorage.getItem('att_pending_update_restore');
          if (pendingRestoreId) {
            try { await restoreSnapshot(pendingRestoreId); } catch (e) {}
            await storageRemoveItem('att_pending_update_restore');
            await storageSetItem(HAS_SEEN_WELCOME_KEY, 'true');
            await storageRemoveItem('att_just_updated');
            await storageRemoveItem('att_pwa_update_ready');
            await storageRemoveItem('att_pwa_latest_version');
            await storageRemoveItem('att_pwa_update_summary');
            if (arrivedAfterUpdate) void notifyUpdateCompleted(APP_VERSION);
            window.location.reload();
            return;
          }
          await storageSetItem(HAS_SEEN_WELCOME_KEY, 'true');
          await storageRemoveItem('att_just_updated');
          if (arrivedAfterUpdate) void notifyUpdateCompleted(APP_VERSION);
          setShowWelcome(false);
        }}
      />
      </Suspense>
    );
  }

  return <AuthGate />;
}

export default function App() {
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const onStorageError = () => setStorageError(true);
    const flushOnHide = () => { if (document.visibilityState === 'hidden') void flushStorageWrites(); };
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
      window.removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', flushOnHide);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    initStorageAndMigrate().then(() => ensureCurriculumMigration()).finally(() => { if (alive) setStorageReady(true); });

    const applyCurrentTheme = () => applyThemePreference(readThemePreference());
    applyCurrentTheme();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      if (readThemePreference() === 'system') applyCurrentTheme();
    };
    mediaQuery.addEventListener?.('change', onSystemThemeChange);
    return () => {
      alive = false;
      mediaQuery.removeEventListener?.('change', onSystemThemeChange);
    };
  }, []);

  if (!storageReady) return null;

  return (
    <>
      {storageError && (
        <div className="fixed inset-x-3 top-[5.25rem] z-[180] rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-xs text-amber-100 shadow-xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <p><strong>Storage Warning:</strong> Your latest changes may not be fully durable. Export a backup from Settings before closing the app.</p>
            <button type="button" onClick={() => setStorageError(false)} className="shrink-0 font-bold text-amber-200" aria-label="Dismiss Storage Warning">Dismiss</button>
          </div>
        </div>
      )}
      <AuthProvider>
      <CustomDataProvider>
        <AttendanceProvider>
          <ReminderSyncProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
              <MainAppFlow />
            </WouterRouter>
          </ReminderSyncProvider>
        </AttendanceProvider>
      </CustomDataProvider>
      </AuthProvider>
    </>
  );
}