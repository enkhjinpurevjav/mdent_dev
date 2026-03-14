import { useEffect } from "react";
import { useRouter } from "next/router";

export default function NurseIndexPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) {
      router.replace("/nurse/schedule");
    }
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
