/**
 * Auth utilities for cookie-based JWT authentication.
 *
 * All requests use `credentials: "include"` so the httpOnly access_token
 * cookie is sent automatically by the browser.
 */

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  branchId: number | null;
  ovog?: string | null;
  regNo?: string | null;
}

/** Call /api/auth/me to get the current authenticated user, or null on 401. */
export async function getMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as AuthUser;
  } catch {
    return null;
  }
}

/** Login with email+password. Returns the user on success, throws on failure. */
export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Login failed (HTTP ${res.status})`);
  }
  return data.user as AuthUser;
}

/** Logout — clears the httpOnly cookie. */
export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

