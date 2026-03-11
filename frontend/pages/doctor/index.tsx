import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DoctorIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/doctor/appointments");
  }, [router]);
  return null;
}
