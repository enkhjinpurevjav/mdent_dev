import { useState } from "react";
import { useRouter } from "next/router";
import { login, getMe } from "../utils/auth";
import { useAuth } from "../contexts/AuthContext";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshMe } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login(email, password);

      // Verify the session cookie was stored correctly before redirecting.
      // If /api/auth/me returns 401 right after login (e.g. cookie domain
      // mismatch or proxy issue), surface a clear error instead of silently
      // staying on the login page.
      const verified = await getMe();
      if (!verified) {
        setError(
          "Нэвтэрсэн боловч сессийг тогтоох боломжгүй байна. " +
            "Хуудсаа дахин ачаалаад оролдоно уу."
        );
        return;
      }

      // Synchronize AuthContext so route guards in _app.tsx immediately know
      // the user is authenticated and don't bounce them back to /login.
      await refreshMe();

      const redirectParam =
        typeof router.query.redirect === "string" ? router.query.redirect : "";

      const isDoctor = user?.role === "doctor";
      const isNurse = user?.role === "nurse";
      const isReceptionist = user?.role === "receptionist";
      const isXray = user?.role === "xray";
      const isAdminRole = ["admin", "super_admin"].includes(user?.role ?? "");

      // Role-scoped redirect safety:
      // Doctors stay in /doctor/*, nurses stay in /nurse/*, receptionists stay in /reception/*,
      // xray stays in /xray/*, admin/super_admin can use any redirect.
      let safeRedirect = "";
      if (redirectParam) {
        if (isDoctor && redirectParam.startsWith("/doctor")) {
          safeRedirect = redirectParam;
        } else if (isNurse && redirectParam.startsWith("/nurse")) {
          safeRedirect = redirectParam;
        } else if (isReceptionist && redirectParam.startsWith("/reception")) {
          safeRedirect = redirectParam;
        } else if (isXray && redirectParam.startsWith("/xray")) {
          safeRedirect = redirectParam;
        } else if (isAdminRole) {
          safeRedirect = redirectParam;
        }
      }

      const fallback = isDoctor
        ? "/doctor/appointments"
        : isNurse
        ? "/nurse/schedule"
        : isReceptionist
        ? "/reception/appointments"
        : isXray
        ? "/xray"
        : "/bookings";

      router.replace(safeRedirect || fallback);
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          И-мэйл
        </label>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@mdent.cloud"
          autoFocus
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Нууц үг
        </label>
        <input
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          type="password"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
      >
        {loading ? "Нэвтэрч байна..." : "Нэвтрэх"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
