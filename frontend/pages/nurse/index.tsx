import { useEffect } from "react";
import { useRouter } from "next/router";

export default function NurseIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/nurse/schedule");
  }, [router]);

  return null;
}
