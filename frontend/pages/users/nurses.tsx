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
    <main className="max-w-7xl px-4 lg:px-8 my-4 font-sans">
      <h1 className="text-2xl font-bold mt-1 mb-2">Сувилагч</h1>
      <p className="text-gray-500 mb-4">
        Сувилагч ажилчдыг бүртгэх, салбарт хуваарьлах, жагсаалтаар харах.
      </p>

      <UsersTabs />

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl p-4 bg-blue-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-blue-700 uppercase mb-1.5">
            НИЙТ СУВИЛАГЧ
          </div>
          <div className="text-3xl font-bold mb-1">
            {summary ? summary.total : "—"}
          </div>
          <div className="text-xs text-gray-600">
            Системд бүртгэлтэй нийт сувилагч ажилчдын тоо.
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-green-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-green-700 uppercase mb-1.5">
            ӨНӨӨДӨР АЖИЛЛАЖ БУЙ СУВИЛАГЧ
          </div>
          <div className="text-3xl font-bold mb-1">
            {summary ? summary.workingToday : "—"}
          </div>
          <div className="text-xs text-gray-600">
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

      {loading && <p className="text-gray-500 text-sm">Ачааллаж байна...</p>}
      {!loading && error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["#", "Овог", "Нэр", "И-мэйл", "РД", "Утас", "Салбар", "Үйлдэл"].map((label) => (
                  <th
                    key={label}
                    className="sticky top-0 z-10 text-left border-b border-gray-200 py-2 px-3 font-semibold text-gray-700 whitespace-nowrap bg-gray-50"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const btnCls = "inline-flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors";
                const tooltipCls = "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100";
                return users.map((u, index) => {
                  const baseUrl = `/users/nurse/${u.id}`;
                  return (
                    <tr key={u.id} className="odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                      <td className="border-b border-gray-100 py-2 px-3">{index + 1}</td>
                      <td className="border-b border-gray-100 py-2 px-3">{u.ovog || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3">{u.name || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3">{u.email}</td>
                      <td className="border-b border-gray-100 py-2 px-3">{u.regNo || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3">{u.phone || "-"}</td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        {Array.isArray(u.branches) && u.branches.length > 0
                          ? u.branches.map((b) => b.name).join(", ")
                          : u.branch
                          ? u.branch.name
                          : "-"}
                      </td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        <div className="flex items-center gap-1">
                          {/* Профайл */}
                          <div className="group relative inline-block">
                            <a href={baseUrl} aria-label="Профайл" className={btnCls}>
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                              </svg>
                            </a>
                            <span className={tooltipCls}>Профайл</span>
                          </div>
                          {/* Ажлын хуваарь */}
                          <div className="group relative inline-block">
                            <a href={`${baseUrl}?tab=schedule`} aria-label="Ажлын хуваарь" className={btnCls}>
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                              </svg>
                            </a>
                            <span className={tooltipCls}>Ажлын хуваарь</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-6 text-sm">
                    Өгөгдөл алга
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
