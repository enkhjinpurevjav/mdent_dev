import React, { useEffect, useState } from "react";
import UsersTabs from "../../components/UsersTabs";

type Branch = {
  id: number;
  name: string;
};

type Nurse = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  role: string;
  regNo?: string | null;
  phone?: string | null;
  branchId?: number | null;
  branch?: Branch | null;
  branches?: Branch[];
  createdAt?: string;
};

function NurseForm({
  branches,
  onSuccess,
}: {
  branches: Branch[];
  onSuccess: (u: Nurse) => void;
}) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    ovog: "",
    regNo: "",
    phone: "",
    branchIds: [] as number[],
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleBranchToggle = (branchId: number) => {
    setForm((prev) => {
      const exists = prev.branchIds.includes(branchId);
      return {
        ...prev,
        branchIds: exists
          ? prev.branchIds.filter((id) => id !== branchId)
          : [...prev.branchIds, branchId],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const primaryBranchId =
        form.branchIds.length > 0 ? form.branchIds[0] : undefined;

      const payload: any = {
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        ovog: form.ovog || undefined,
        role: "nurse",
        branchId: primaryBranchId,
        phone: form.phone || undefined,
      };

      if (form.regNo.trim()) {
        payload.regNo = form.regNo.trim();
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data || !data.id) {
        setError((data && data.error) || "Алдаа гарлаа");
        setSubmitting(false);
        return;
      }

      const createdUser = data as Nurse;

      if (form.branchIds.length > 0) {
        try {
          const resBranches = await fetch(
            `/api/users/${createdUser.id}/branches`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ branchIds: form.branchIds }),
            }
          );
          let branchesData: any = null;
          try {
            branchesData = await resBranches.json();
          } catch {
            branchesData = null;
          }

          if (
            resBranches.ok &&
            branchesData &&
            Array.isArray(branchesData.branches)
          ) {
            createdUser.branches = branchesData.branches;
          }
        } catch (err) {
          console.error("Failed to assign multiple branches", err);
        }
      }

      onSuccess(createdUser);

      setForm({
        email: "",
        password: "",
        name: "",
        ovog: "",
        regNo: "",
        phone: "",
        branchIds: [],
      });
    } catch {
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <h2>Шинэ сувилагч бүртгэх</h2>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2 mb-2">
        <input
          name="ovog"
          placeholder="Овог"
          value={form.ovog}
          onChange={handleChange}
          required
        />
        <input
          name="name"
          placeholder="Нэр"
          value={form.name}
          onChange={handleChange}
          required
        />
        <input
          name="regNo"
          placeholder="РД"
          value={form.regNo}
          onChange={handleChange}
        />
        <input
          name="phone"
          placeholder="Утас"
          value={form.phone}
          onChange={handleChange}
        />
        <input
          name="email"
          type="email"
          placeholder="И-мэйл"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Нууц үг"
          value={form.password}
          onChange={handleChange}
          required
        />
      </div>

      <div className="mb-2">
        <div className="mb-1 font-medium">Салбар сонгох</div>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <label
              key={b.id}
              className="inline-flex items-center gap-1 border border-gray-200 rounded px-2 py-1 text-[13px]"
            >
              <input
                type="checkbox"
                checked={form.branchIds.includes(b.id)}
                onChange={() => handleBranchToggle(b.id)}
              />
              {b.name}
            </label>
          ))}
        </div>
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? "Бүртгэж байна..." : "Бүртгэх"}
      </button>

      {error && <div className="text-red-600 mt-2">{error}</div>}
    </form>
  );
}

export default function NursesPage() {
  const [users, setUsers] = useState<Nurse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState<{
    total: number;
    workingToday: number;
  } | null>(null);

  const loadBranches = async () => {
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setBranches(data);
      }
    } catch {
      // ignore
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users?role=nurse");
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !Array.isArray(data)) {
        throw new Error((data && data.error) || "Алдаа гарлаа");
      }

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

  const loadSummary = async () => {
    try {
      const usersRes = await fetch("/api/users?role=nurse");
      const usersData = await usersRes.json().catch(() => null);
      const total =
        usersRes.ok && Array.isArray(usersData) ? usersData.length : 0;

      const todayRes = await fetch("/api/users/nurses/today");
      const todayData = await todayRes.json().catch(() => null);
      const workingToday =
        todayRes.ok && todayData && typeof todayData.count === "number"
          ? todayData.count
          : 0;

      setSummary({ total, workingToday });
    } catch {
      setSummary(null);
    }
  };

  useEffect(() => {
    loadBranches();
    loadUsers();
    loadSummary();
  }, []);

  return (
    <main className="max-w-[900px] mx-auto my-10 p-6 font-sans">
      <h1>Сувилагч</h1>
      <p className="text-gray-500 mb-4">
        Сувилагч ажилчдыг бүртгэх, салбарт хуваарьлах, жагсаалтаар харах.
      </p>

      <UsersTabs />

      <section className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3 mb-4">
        <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-100 p-3 shadow">
          <div className="text-xs uppercase text-blue-700 font-bold tracking-wide mb-1">
            Нийт сувилагч
          </div>
          <div className="text-[26px] font-bold text-gray-900 mb-1">
            {summary ? summary.total : "—"}
          </div>
          <div className="text-xs text-gray-500">
            Системд бүртгэлтэй нийт сувилагч ажилчдын тоо.
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-100 to-white rounded-xl border border-green-200 p-3 shadow">
          <div className="text-xs uppercase text-green-700 font-bold tracking-wide mb-1">
            Өнөөдөр ажиллаж буй сувилагч
          </div>
          <div className="text-[26px] font-bold text-gray-900 mb-1">
            {summary ? summary.workingToday : "—"}
          </div>
          <div className="text-xs text-gray-500">
            Өнөөдрийн ажлын хуваарьт орсон сувилагчдын тоо.
          </div>
        </div>
      </section>

      <NurseForm
        branches={branches}
        onSuccess={(u) => {
          setUsers((prev) => [u, ...prev]);
          loadSummary();
        }}
      />

      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <table className="w-full border-collapse mt-2 text-sm">
          <thead>
            <tr>
              <th className="text-left border-b border-gray-200 p-2">#</th>
              <th className="text-left border-b border-gray-200 p-2">Овог</th>
              <th className="text-left border-b border-gray-200 p-2">Нэр</th>
              <th className="text-left border-b border-gray-200 p-2">И-мэйл</th>
              <th className="text-left border-b border-gray-200 p-2">РД</th>
              <th className="text-left border-b border-gray-200 p-2">Утас</th>
              <th className="text-left border-b border-gray-200 p-2">Салбар</th>
              <th className="text-left border-b border-gray-200 p-2">Профайл</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, index) => (
              <tr key={u.id}>
                <td className="border-b border-gray-100 p-2">{index + 1}</td>
                <td className="border-b border-gray-100 p-2">{u.ovog || "-"}</td>
                <td className="border-b border-gray-100 p-2">{u.name || "-"}</td>
                <td className="border-b border-gray-100 p-2">{u.email}</td>
                <td className="border-b border-gray-100 p-2">{u.regNo || "-"}</td>
                <td className="border-b border-gray-100 p-2">{u.phone || "-"}</td>
                <td className="border-b border-gray-100 p-2">
                  {Array.isArray(u.branches) && u.branches.length > 0
                    ? u.branches.map((b) => b.name).join(", ")
                    : u.branch
                    ? u.branch.name
                    : "-"}
                </td>
                <td className="border-b border-gray-100 p-2 whitespace-nowrap">
                  <a
                    href={`/users/nurse/${u.id}`}
                    className="px-1.5 py-0.5 text-xs rounded border border-blue-600 text-blue-600 no-underline"
                  >
                    Профайл
                  </a>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 p-3">
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
