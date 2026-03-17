import type { AppProps } from "next/app";
import AdminLayout from "../components/AdminLayout";
import DoctorLayout from "../components/DoctorLayout";
import NurseLayout from "../components/NurseLayout";
import ReceptionLayout from "../components/ReceptionLayout";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import "../styles/globals.css";

// Routes that do not require authentication
const PUBLIC_ROUTES = ["/login", "/online", "/print", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isDoctorPath(pathname: string) {
  return pathname === "/doctor" || pathname.startsWith("/doctor/");
}

function isNursePath(pathname: string) {
  return pathname === "/nurse" || pathname.startsWith("/nurse/");
}

function isReceptionPath(pathname: string) {
  return pathname === "/reception" || pathname.startsWith("/reception/");
}

function isAppointmentsPath(pathname: string) {
  return (
    pathname === "/appointments" ||
    pathname.startsWith("/appointments/") ||
    pathname === "/reception/appointments" ||
    pathname.startsWith("/reception/appointments/")
  );
}

function ToothLoader() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: "12px",
        fontSize: "16px",
        color: "#555",
      }}
    >
      <span style={{ fontSize: "48px" }}>🦷</span>
      <span>ачаалж байна</span>
    </div>
  );
}

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { me, loading } = useAuth();

  const isPublicRoute = isPublicPath(router.pathname);

  useEffect(() => {
    if (loading) return;
    if (!me && !isPublicRoute) {
      router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
    }
  }, [loading, me, isPublicRoute, router]);

  // Show tooth loader during initial auth bootstrap for protected pages
  if (loading && !isPublicRoute) {
    return <ToothLoader />;
  }

  // Unauthenticated on a protected route — show loader while redirect is in flight
  if (!loading && !me && !isPublicRoute) {
    return <ToothLoader />;
  }

  if (isPublicRoute) {
    return <Component {...pageProps} />;
  }

  const userRole = me?.role ?? null;

  const isPatientPath = router.pathname.startsWith("/patients/");
  const isEncounterPath = router.pathname.startsWith("/encounters/");
  const useDoctorLayout =
    isDoctorPath(router.pathname) || ((isPatientPath || isEncounterPath) && userRole === "doctor");
  const useNurseLayout = isNursePath(router.pathname);
  const useReceptionLayout = isReceptionPath(router.pathname);

  // Wide layout for appointments pages (admin + reception) to support many doctor columns
  const wide = isAppointmentsPath(router.pathname);

  if (useDoctorLayout) {
    const showDashboardSummary = router.pathname === "/doctor/appointments";
    return (
      <DoctorLayout showDashboardSummary={showDashboardSummary}>
        <Component {...pageProps} />
      </DoctorLayout>
    );
  }

  if (useNurseLayout) {
    return (
      <NurseLayout>
        <Component {...pageProps} />
      </NurseLayout>
    );
  }

  if (useReceptionLayout) {
    return (
      <ReceptionLayout wide={wide}>
        <Component {...pageProps} />
      </ReceptionLayout>
    );
  }

  return (
    <AdminLayout wide={wide}>
      <Component {...pageProps} />
    </AdminLayout>
  );
}

export default function MyApp(props: AppProps) {
  return (
    <AuthProvider>
      <AppContent {...props} />
    </AuthProvider>
  );
}
