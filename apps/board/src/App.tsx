import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { TooltipProvider } from '@moonwitness/ui/components/tooltip';
import { ProtectedRoute } from '@/components/layout/protected-route';

const AuthPage = lazy(() =>
  import('@/pages/auth-page').then((module) => ({ default: module.AuthPage }))
);
const AppShell = lazy(() =>
  import('@/components/layout/app-shell').then((module) => ({ default: module.AppShell }))
);
const DashboardPage = lazy(() =>
  import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage }))
);
const ModelPage = lazy(() =>
  import('@/pages/model-page').then((module) => ({ default: module.ModelPage }))
);
const ProfilePage = lazy(() =>
  import('@/pages/profile-page').then((module) => ({ default: module.ProfilePage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense
              fallback={<div className="min-h-dvh bg-paper" aria-label="Loading MoonWitness" />}
            >
              <Routes>
                {/* Public Auth Routes */}
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/register" element={<AuthPage mode="register" />} />

                {/* Protected Board Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/m/:model" element={<ModelPage />} />
                    <Route path="/m/:model/:id" element={<ModelPage />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
