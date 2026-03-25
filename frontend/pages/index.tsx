import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

/** Maps each role to its home route. */
const ROLE_HOME: Record<string, string> = {
  admin: "/bookings",
  super_admin: "/bookings",
  receptionist: "/reception/appointments",
  doctor: "/doctor/appointments",
  nurse: "/nurse/schedule",
  xray: "/xray",
};

export default function IndexPage() {
  const router = useRouter();
  const { me, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!me) {
      router.replace("/login?redirect=/");
      return;
    }

    const target = ROLE_HOME[me.role] ?? "/login";
    // Guard against redirect loops: only navigate if not already there.
    if (router.pathname !== target) {
      router.replace(target);
    }
  }, [loading, me, router]);

  // Show a loading indicator while deciding where to redirect.
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
