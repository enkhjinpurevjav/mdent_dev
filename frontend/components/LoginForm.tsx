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
      await login(email, password);
      const redirect = (router.query.redirect as string) || "/";
      router.replace(redirect);
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        autoFocus
        required
      />
      <input
        name="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? "Logging in…" : "Login"}
      </button>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </form>
  );
}
