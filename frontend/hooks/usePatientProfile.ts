// Hook for patient profile fetching logic

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { PatientProfileResponse } from '../types/patients';

export function usePatientProfile() {
  const router = useRouter();
  const { bookNumber } = router.query;

  const [data, setData] = useState<PatientProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Shared fetch logic
  const fetchProfile = async (bookNum: string) => {
    const res = await fetch(
  `/api/patients/profile/by-book/${encodeURIComponent(bookNum)}`,
  { credentials: "include" }
);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error((json && json.error) || "failed to load");
    }

    return json as PatientProfileResponse;
  };

  useEffect(() => {
    if (!bookNumber || typeof bookNumber !== "string") return;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const json = await fetchProfile(bookNumber);
        setData(json);
      } catch (err) {
        console.error(err);
        setError("Профайлыг ачааллах үед алдаа гарлаа");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [bookNumber]);

  const refetch = async () => {
    if (bookNumber && typeof bookNumber === "string") {
      setLoading(true);
      setError("");
      try {
        const json = await fetchProfile(bookNumber);
        setData(json);
      } catch (err) {
        console.error(err);
        setError("Профайлыг ачааллах үед алдаа гарлаа");
        setData(null);
      } finally {
        setLoading(false);
      }
    }
  };

  return { data, loading, error, bookNumber, refetch };
}
