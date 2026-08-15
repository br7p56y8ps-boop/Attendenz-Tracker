import { useEffect, useState } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AttendanceProvider } from '@/contexts/AttendanceContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CustomDataProvider, useCustomData } from '@/contexts/CustomDataContext';
import { initStorageAndMigrate } from '@/lib/idb';
import { WhatsNewPopup } from '@/components/WhatsNewPopup';
import WelcomeVideoScreen from '@/components/video/WelcomeVideoScreen';
import { restoreSnapshot } from '@/utils/snapshotUtils';
import Home from '@/pages/Home';
import Subjects from '@/pages/Subjects';
import AddNew from '@/pages/AddNew';
import CalendarPage from '@/pages/CalendarPage';
import Account from '@/pages/Account';
import Login from '@/pages/Login';
import SetupScreen from '@/pages/SetupScreen';
import NotFound from '@/pages/not-found';

const HAS_SEEN_WELCOME_KEY = 'att_has_seen_welcome_v1';

function AuthGate() {
  const { isLoggedIn } = useAuth();
  const { setupDone } = useCustomData();

  if (!isLoggedIn) {
    return <Login />;
  }

  if (!setupDone) {
    return <SetupScreen />;
  }

  return (
    <>
      <WhatsNewPopup />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/subjects" component={Subjects} />
        <Route path="/add-new" component={AddNew} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/account" component={Account} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function MainAppFlow() {
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    const justUpdated = localStorage.getItem('att_just_updated') === 'true';
    const hasSeenWelcome = localStorage.getItem(HAS_SEEN_WELCOME_KEY) === 'true';
    return justUpdated || !hasSeenWelcome;
  });

  if (showWelcome) {
    return (
            <WelcomeVideoScreen
        onComplete={() => {
          // Silent auto-restore of pre-update snapshot if it exists
          const pendingRestoreId = localStorage.getItem('att_pending_update_restore');
          if (pendingRestoreId) {
            try {
              restoreSnapshot(pendingRestoreId);
            } catch (e) {
              // Fail silently, data remains intact
            }
            localStorage.removeItem('att_pending_update_restore');
          }
          
          localStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
          localStorage.removeItem('att_just_updated'); // clear update flag so next render doesn't force setup
          setShowWelcome(false);
        }}
      />
    );
  }

  return <AuthGate />;
}

export default function App() {
  useEffect(() => {
    // Initialize IndexedDB local storage migration and persistence
    initStorageAndMigrate();

    // Global Theme Initialization (Default: Dark Mode)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      if (!savedTheme) {
        localStorage.setItem('theme', 'dark');
      }
    }
  }, []);

  return (
    <AuthProvider>
      <AttendanceProvider>
        <CustomDataProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
            <MainAppFlow />
          </WouterRouter>
        </CustomDataProvider>
      </AttendanceProvider>
    </AuthProvider>
  );
}