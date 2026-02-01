import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute, ChangePasswordRoute, DeveloperRoute } from "./components/ProtectedRoute";
import { PageLayout } from "./components/PageLayout";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { TodaysPlanPage } from "./pages/TodaysPlanPage";
import { ManagementPage } from "./pages/ManagementPage";
import { FleetPage } from "./pages/FleetPage";
import { ConsignmentsPage } from "./pages/ConsignmentsPage";
import { ReportsPage } from "./pages/ReportsPage";

const PlaceholderPage = ({ title }: { title: string }) => (
  <>
    <h2 className="dashboard-page-title">{title}</h2>
    <div className="dashboard-page-content" />
  </>
);

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/change-password"
            element={
              <ChangePasswordRoute>
                <ChangePasswordPage />
              </ChangePasswordRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <PageLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<TodaysPlanPage />} />
            <Route path="/overview" element={<PlaceholderPage title="Overview" />} />
            <Route path="/consignments" element={<ConsignmentsPage />} />
            <Route path="/fleet" element={<FleetPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/management" element={<DeveloperRoute><ManagementPage /></DeveloperRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
