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

const PAGE_SIZE = 30;

export default function UsersIndexPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

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

  // Reset to page 1 whenever the users list is refreshed
  useEffect(() => {
    setPage(1);
  }, [users.length]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedUsers = users.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    <main className="max-w-7xl px-4 lg:px-8 my-4 font-sans">
      <h1 className="text-2xl font-bold mt-1 mb-2">Ажилтнууд</h1>
      <p className="text-gray-500 mb-4">
        Эмч, ресепшн, сувилагч болон бусад ажилтнуудын мэдээллийг нэг жагсаалтаар
        харах.
      </p>

      <UsersTabs />

      {loading && <p className="text-gray-500 text-sm">Ачааллаж байна...</p>}
      {!loading && error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["#", "Овог", "Нэр", "Үүрэг", "РД", "Утас", "Салбар"].map((label) => (
                    <th
                      key={label}
                      className={`sticky top-0 z-10 text-left border-b border-gray-200 py-2 px-3 font-semibold text-gray-700 bg-gray-50${label === "Салбар" ? " whitespace-normal break-words" : " whitespace-nowrap"}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u, index) => {
                  const rowNumber = (safePage - 1) * PAGE_SIZE + index + 1;
                  return (
                    <tr key={u.id} className="odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">{rowNumber}</td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">{u.ovog || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">{u.name || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">{getRoleLabel(u.role)}</td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">{u.regNo || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">{u.phone || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-normal break-words">
                        {Array.isArray(u.branches) && u.branches.length > 0
                          ? u.branches.map((b) => b.name).join(", ")
                          : u.branch
                          ? u.branch.name
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-6 text-sm">
                      Өгөгдөл алга
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Нийт {users.length} бичлэг — {safePage} / {totalPages} хуудас
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Өмнөх
                </button>
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Дараах
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
