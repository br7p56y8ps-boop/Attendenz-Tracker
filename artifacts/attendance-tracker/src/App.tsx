import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AttendanceProvider } from '@/contexts/AttendanceContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CustomDataProvider, useCustomData } from '@/contexts/CustomDataContext';
import { WhatsNewPopup } from '@/components/WhatsNewPopup';
import Home from '@/pages/Home';
import Subjects from '@/pages/Subjects';
import AddNew from '@/pages/AddNew';
import CalendarPage from '@/pages/CalendarPage';
import Account from '@/pages/Account';
import Login from '@/pages/Login';
import SetupScreen from '@/pages/SetupScreen';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function AuthGate() {
  const { isLoggedIn } = useAuth();
  const { setupDone } = useCustomData();

  if (!isLoggedIn) {
    return <Login />;
  }

  // Show setup/migration screen until the user makes their subject mode choice
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AttendanceProvider>
          <CustomDataProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
              <AuthGate />
            </WouterRouter>
          </CustomDataProvider>
        </AttendanceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
