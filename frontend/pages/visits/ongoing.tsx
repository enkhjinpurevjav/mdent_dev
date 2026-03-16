import { useEffect } from "react";
import { useRouter } from "next/router";

export default function OngoingVisitsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/visits");
  }, [router]);
  return null;
}
