import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { token } = router.query;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой.");
      return;
    }
    if (password !== confirm) {
      setError("Нууц үг тохирохгүй байна.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Алдаа гарлаа. Дахин оролдоно уу.");
      } else {
        setDone(true);
        setTimeout(() => router.replace("/login"), 2000);
      }
    } catch {
      setError("Сервертэй холбогдоход алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="bg-gray-900 text-white px-6 py-3 flex items-center shadow">
        <span className="text-lg font-semibold tracking-wide">M DENT</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Шинэ нууц үг тохируулах
          </h1>

          {done ? (
            <p className="text-sm text-green-600 text-center">
              Нууц үг амжилттай солигдлоо. Нэвтрэх хуудас руу шилжиж байна…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Шинэ нууц үг
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Дор хаяж 6 тэмдэгт"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Нууц үг давтах
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Нууц үгийг давтана уу"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {loading ? "Хадгалж байна…" : "Нууц үг солих"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/login" className="text-blue-600 hover:underline">
              Нэвтрэх хуудас руу буцах
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
