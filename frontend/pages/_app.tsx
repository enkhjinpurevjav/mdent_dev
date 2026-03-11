import type { AppProps } from "next/app";
import AdminLayout from "../components/AdminLayout";
import DoctorLayout from "../components/DoctorLayout";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { getMe } from "../utils/auth";
import "../styles/globals.css";


// Routes that do not require authentication
const PUBLIC_ROUTES = ["/login", "/online", "/print", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isDoctorPath(pathname: string) {
  return pathname === "/doctor" || pathname.startsWith("/doctor/");
}

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

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
      // Doctor portal: only doctors allowed
      if (isDoctorPath(router.pathname) && user.role !== "doctor") {
        router.replace("/");
        return;
      }
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

  if (isDoctorPath(router.pathname)) {
    return (
      <DoctorLayout>
        <Component {...pageProps} />
      </DoctorLayout>
    );
  }

  return (
    <AdminLayout>
      <Component {...pageProps} />
    </AdminLayout>
  );
}
