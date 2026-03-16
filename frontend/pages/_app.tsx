import type { AppProps } from "next/app";
import AdminLayout from "../components/AdminLayout";
import DoctorLayout from "../components/DoctorLayout";
import NurseLayout from "../components/NurseLayout";
import ReceptionLayout from "../components/ReceptionLayout"; // ✅ ADD
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { getMe } from "../utils/auth";
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

// ✅ ADD
function isReceptionPath(pathname: string) {
  return pathname === "/reception" || pathname.startsWith("/reception/");
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const isPublicRoute = isPublicPath(router.pathname);

  useEffect(() => {
    if (isPublicPath(router.pathname)) {
      setAuthChecked(true);
      return;
    }

    getMe().then((user) => {
      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
        return;
      }

      // Non-doctors cannot access /doctor/*
      if (isDoctorPath(router.pathname) && user.role !== "doctor") {
        router.replace("/");
        return;
      }

      // Non-nurses cannot access /nurse/*
      if (isNursePath(router.pathname) && user.role !== "nurse") {
        router.replace("/");
        return;
      }

      // ✅ OPTIONAL (recommended): only reception can access /reception/*
      if (isReceptionPath(router.pathname) && user.role !== "receptionist") {
        router.replace("/");
        return;
      }

      // Doctors cannot access anything outside /doctor/* EXCEPT /patients/* and /encounters/*
      if (
        user.role === "doctor" &&
        !isDoctorPath(router.pathname) &&
        !router.pathname.startsWith("/patients") &&
        !router.pathname.startsWith("/encounters")
      ) {
        router.replace("/doctor/appointments");
        return;
      }

      // Nurses cannot access anything outside /nurse/*
      if (user.role === "nurse" && !isNursePath(router.pathname)) {
        router.replace("/nurse/schedule");
        return;
      }

      setUserRole(user.role);
      setAuthChecked(true);
    });
  }, [router]);

  // Don't render protected pages until auth is confirmed
  if (!isPublicPath(router.pathname) && !authChecked) {
    return null;
  }

  if (isPublicRoute) {
    return <Component {...pageProps} />;
  }

  const isPatientPath = router.pathname.startsWith("/patients/");
  const isEncounterPath = router.pathname.startsWith("/encounters/");
  const useDoctorLayout =
    isDoctorPath(router.pathname) || ((isPatientPath || isEncounterPath) && userRole === "doctor");
  const useNurseLayout = isNursePath(router.pathname);

  // ✅ ADD: reception layout selection
  const useReceptionLayout = isReceptionPath(router.pathname);

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

  // ✅ ADD: reception routes should not be wrapped in AdminLayout
  if (useReceptionLayout) {
    return (
      <ReceptionLayout>
        <Component {...pageProps} />
      </ReceptionLayout>
    );
  }

  return (
    <AdminLayout>
      <Component {...pageProps} />
    </AdminLayout>
  );
}
