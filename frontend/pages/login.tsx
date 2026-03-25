import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import LoginForm from "../components/LoginForm";
import PublicHeader from "../components/PublicHeader";
import { useAuth } from "../contexts/AuthContext";

/** Maps each role to its home route — kept in sync with index.tsx. */
const ROLE_HOME: Record<string, string> = {
  admin: "/bookings",
  super_admin: "/bookings",
  receptionist: "/reception/appointments",
  doctor: "/doctor/appointments",
  nurse: "/nurse/schedule",
  xray: "/xray",
};

export default function LoginPage() {
  const router = useRouter();
  const { me, loading } = useAuth();

  // If user is already authenticated, redirect them away from the login page.
  useEffect(() => {
    if (loading || !me) return;

    const redirectParam =
      typeof router.query.redirect === "string" ? router.query.redirect : "";

    const roleHome = ROLE_HOME[me.role] ?? "/bookings";

    // Use the redirect param only when it is safe for the user's role.
    let destination = roleHome;
    if (redirectParam) {
      const isDoctor = me.role === "doctor";
      const isNurse = me.role === "nurse";
      const isReceptionist = me.role === "receptionist";
      const isXray = me.role === "xray";
      const isAdminRole = ["admin", "super_admin"].includes(me.role);
      if (isDoctor && redirectParam.startsWith("/doctor")) {
        destination = redirectParam;
      } else if (isNurse && redirectParam.startsWith("/nurse")) {
        destination = redirectParam;
      } else if (isReceptionist && redirectParam.startsWith("/reception")) {
        destination = redirectParam;
      } else if (isXray && redirectParam.startsWith("/xray")) {
        destination = redirectParam;
      } else if (isAdminRole) {
        destination = redirectParam;
      }
    }

    router.replace(destination);
  }, [loading, me, router]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <PublicHeader />

      {/* Centered card */}
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Нэвтрэх</h1>
          <LoginForm />
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Нууц үг сэргээх
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
