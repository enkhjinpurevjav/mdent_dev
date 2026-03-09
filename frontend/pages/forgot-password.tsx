import { useState } from "react";
import Link from "next/link";
import PublicHeader from "../components/PublicHeader";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <PublicHeader />

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Нууц үг сэргээх</h1>

          {submitted ? (
            <p className="text-sm text-gray-600 text-center">
              Хэрэв таны имэйл бүртгэлтэй бол нууц үг сэргээх холбоос илгээгдсэн болно.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Имэйл хаяг
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="example@mdent.cloud"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {loading ? "Илгээж байна…" : "Илгээх"}
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
