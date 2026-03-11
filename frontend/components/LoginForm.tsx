import { useState } from "react";
import { useRouter } from "next/router";
import { login } from "../utils/auth";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login(email, password);

      // Honor explicit redirect first (when user was forced to login)
      const redirectParam =
        typeof router.query.redirect === "string" ? router.query.redirect : "";

      // Otherwise, role-based default landing page
      const fallback = user?.role === "doctor" ? "/doctor" : "/";

      router.replace(redirectParam || fallback);
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
