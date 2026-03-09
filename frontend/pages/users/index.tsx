import React, { useEffect, useState } from "react";
import UsersTabs from "../../components/UsersTabs";

type Branch = {
  id: number;
  name: string;
};

type User = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  role: string;
  regNo?: string | null;
  phone?: string | null;
  branchId?: number | null;
  branch?: Branch | null;
  branches?: Branch[]; // NEW: multi-branch support
};

export default function UsersIndexPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/users");
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok || !Array.isArray(data)) {
          throw new Error((data && data.error) || "Алдаа гарлаа");
        }

        // sort by name only (alphabetically)
setUsers(
  [...data].sort((a, b) => {
    const aName = (a.name || "").toString();
    const bName = (b.name || "").toString();
    return aName.localeCompare(bName, "mn");
  })
);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Сүлжээгээ шалгана уу");
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "doctor":
        return "Эмч";
      case "receptionist":
        return "Ресепшн";
      case "nurse":
        return "Сувилагч";
      case "accountant":
        return "Нягтлан";
      case "manager":
        return "Менежер";
      case "admin":
        return "Админ";
      default:
        return role;
    }
  };

  return (
    <main className="p-6 font-sans">
      <h1>Ажилтнууд</h1>
      <p className="text-gray-500 mb-4">
        Эмч, ресепшн, сувилагч болон бусад ажилтнуудын мэдээллийг нэг жагсаалтаар
        харах.
      </p>

      <UsersTabs />

      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <table className="w-full border-collapse mt-2 text-sm">
          <thead>
            <tr>
              <th className="text-left border-b border-gray-200 p-2">#</th>
              <th className="text-left border-b border-gray-200 p-2">Овог</th>
              <th className="text-left border-b border-gray-200 p-2">Нэр</th>
              <th className="text-left border-b border-gray-200 p-2">Үүрэг</th>
              <th className="text-left border-b border-gray-200 p-2">РД</th>
              <th className="text-left border-b border-gray-200 p-2">Утас</th>
              <th className="text-left border-b border-gray-200 p-2">Салбар</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, index) => (
              <tr key={u.id}>
                <td className="border-b border-gray-100 p-2">{index + 1}</td>
                <td className="border-b border-gray-100 p-2">{u.ovog || "-"}</td>
                <td className="border-b border-gray-100 p-2">{u.name || "-"}</td>
                <td className="border-b border-gray-100 p-2">{getRoleLabel(u.role)}</td>
                <td className="border-b border-gray-100 p-2">{u.regNo || "-"}</td>
                <td className="border-b border-gray-100 p-2">{u.phone || "-"}</td>
                <td className="border-b border-gray-100 p-2">
                  {Array.isArray(u.branches) && u.branches.length > 0
                    ? u.branches.map((b) => b.name).join(", ")
                    : u.branch
                    ? u.branch.name
                    : "-"}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 p-3">
                  Өгөгдөл алга
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
