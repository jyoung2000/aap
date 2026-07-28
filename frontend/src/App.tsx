import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SocketProvider } from '@/hooks/useSocket';
import { ToastProvider } from '@/components/ui/Toast';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui/Spinner';
import { SignIn } from '@/pages/SignIn';
import { SignUp } from '@/pages/SignUp';
import { Dashboard } from '@/pages/Dashboard';
import { SearchPage } from '@/pages/Search';
import { Jobs } from '@/pages/Jobs';
import { Queue } from '@/pages/Queue';
import { Analytics } from '@/pages/Analytics';
import { Profile } from '@/pages/Profile';
import { Settings } from '@/pages/Settings';

function FullScreenLoader() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[rgb(var(--bg))]">
      <Spinner className="h-7 w-7 text-accent-600" />
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/signin" replace />;
  return <AppShell />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
