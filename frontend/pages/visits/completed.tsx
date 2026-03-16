import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CompletedVisitsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/visits");
  }, [router]);
  return null;
}
