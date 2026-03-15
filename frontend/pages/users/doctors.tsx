import React, { useEffect, useState } from "react";
import UsersTabs from "../../components/UsersTabs";
import SendResetLinkButton from "../../components/SendResetLinkButton";

type Branch = {
  id: number;
  name: string;
};

type Doctor = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  role: string;
  branchId?: number | null;
  branch?: Branch | null;
  branches?: Branch[];
  regNo?: string | null;
  licenseNumber?: string | null;
  licenseExpiryDate?: string | null;
  phone?: string | null;
  createdAt?: string;
  calendarOrder?: number | null;
};

function DoctorForm({
  branches,
  onSuccess,
}: {
  branches: Branch[];
  onSuccess: (d: Doctor) => void;
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
        role: "doctor",
        branchId: primaryBranchId,
      };

      if (form.regNo.trim()) {
        payload.regNo = form.regNo.trim();
      }
      if (form.phone.trim()) {
        payload.phone = form.phone.trim();
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

      const createdDoctor = data as Doctor;

      // assign multiple branches
      if (form.branchIds.length > 0) {
        try {
          const resBranches = await fetch(
            `/api/users/${createdDoctor.id}/branches`,
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
            createdDoctor.branches = branchesData.branches;
          }
        } catch (err) {
          console.error("Failed to assign multiple branches", err);
        }
      }

      onSuccess(createdDoctor);

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
      <h2>Шинэ эмч бүртгэх</h2>
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

// Stable comparator: null/undefined calendarOrder sorts to the bottom, then tie-break by name
function doctorComparator(a: Doctor, b: Doctor): number {
  const ao = a.calendarOrder != null ? a.calendarOrder : Number.MAX_SAFE_INTEGER;
  const bo = b.calendarOrder != null ? b.calendarOrder : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return (a.name || "").localeCompare(b.name || "", "mn");
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reorderSaving, setReorderSaving] = useState(false);

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

  const loadDoctors = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users?role=doctor");
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok && Array.isArray(data)) {
        const sorted = [...data].sort(doctorComparator);
        setDoctors(sorted);
      } else {
        setError(
          (data && data.error) || "Эмч нарын жагсаалтыг ачааллаж чадсангүй"
        );
      }
    } catch {
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await fetch("/api/staff/summary?role=doctor");
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data.total === "number") {
        setSummary({
          total: data.total,
          workingToday: data.workingToday || 0,
        });
      } else {
        setSummary(null);
      }
    } catch {
      setSummary(null);
    }
  };

  useEffect(() => {
    loadBranches();
    loadDoctors();
    loadSummary();
  }, []);

  const moveDoctor = async (doctorId: number, direction: "up" | "down") => {
    if (reorderSaving) return;
    const idx = doctors.findIndex((d) => d.id === doctorId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === doctors.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;

    // Snapshot previous state for rollback on failure
    const prevDoctors = doctors;

    // Swap the two entries by index and renumber to eliminate duplicates
    const reordered = [...doctors];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const renumbered = reordered.map((d, i) => ({ ...d, calendarOrder: i * 10 }));

    // Only persist doctors whose calendarOrder actually changed
    const changedDoctors = renumbered.filter((d) => {
      const old = prevDoctors.find((p) => p.id === d.id);
      return old?.calendarOrder !== d.calendarOrder;
    });

    setDoctors(renumbered);
    setReorderSaving(true);
    try {
      const results = await Promise.all(
        changedDoctors.map((d) =>
          fetch(`/api/users/${d.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calendarOrder: d.calendarOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        throw new Error("Failed to update calendarOrder");
      }
    } catch (err) {
      console.error("Failed to update calendarOrder", err);
      setDoctors(prevDoctors);
      setError("Дараалал хадгалахад алдаа гарлаа");
    } finally {
      setReorderSaving(false);
    }
  };

  return (
    <main className="max-w-7xl px-4 lg:px-8 my-4 font-sans">
      <h1 className="text-2xl font-bold mt-1 mb-2">Эмч нар</h1>
      <p className="text-gray-500 mb-4">
        Эмч нарыг бүртгэх, салбарт хуваарьлах, профайлыг харах.
      </p>

      <UsersTabs />

      {/* summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl p-4 bg-blue-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-blue-700 uppercase mb-1.5">
            НИЙТ ЭМЧ
          </div>
          <div className="text-3xl font-bold mb-1">
            {summary ? summary.total : "—"}
          </div>
          <div className="text-xs text-gray-600">
            Системд бүртгэлтэй нийт эмчийн тоо.
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-green-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-green-700 uppercase mb-1.5">
            ӨНӨӨДӨР АЖИЛЛАЖ БУЙ ЭМЧ
          </div>
          <div className="text-3xl font-bold mb-1">
            {summary ? summary.workingToday : "—"}
          </div>
          <div className="text-xs text-gray-600">
            Өнөөдрийн ажлын хуваарьт орсон эмч нарын тоо.
          </div>
        </div>
      </section>

      <DoctorForm
        branches={branches}
        onSuccess={(d) => {
          setDoctors((prev) => {
            // Assign calendarOrder after all explicitly-ordered doctors (ignore nulls)
            const maxOrder = prev.reduce(
              (max, doc) => (doc.calendarOrder != null ? Math.max(max, doc.calendarOrder) : max),
              -10
            );
            const newDoctor = { ...d, calendarOrder: maxOrder + 10 };
            return [...prev, newDoctor].sort(doctorComparator);
          });
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
                {["#", "Овог", "Нэр", "РД", "Утас", "Салбар", "Дараалал", "Үйлдэл"].map((label, i) => (
                  <th
                    key={i}
                    className="sticky top-0 z-10 text-left border-b border-gray-200 py-2 px-3 font-semibold text-gray-700 whitespace-nowrap bg-gray-50"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doctors.map((d, index) => {
                const baseUrl = `/users/doctors/${d.id}`;
                const btnCls = "inline-flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors";
                const tooltipCls = "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100";
                const isUpDisabled = index === 0 || reorderSaving;
                const isDownDisabled = index === doctors.length - 1 || reorderSaving;
                return (
                  <tr key={d.id} className="odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                    <td className="border-b border-gray-100 py-2 px-3">{index + 1}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{d.ovog || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{d.name || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{d.regNo || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{d.phone || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {Array.isArray(d.branches) && d.branches.length > 0
                        ? d.branches.map((b) => b.name).join(", ")
                        : d.branch
                        ? d.branch.name
                        : "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveDoctor(d.id, "up")}
                          disabled={isUpDisabled}
                          className={`text-[11px] px-1.5 py-0 ${isUpDisabled ? "opacity-30 cursor-default" : "cursor-pointer"}`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDoctor(d.id, "down")}
                          disabled={isDownDisabled}
                          className={`text-[11px] px-1.5 py-0 ${isDownDisabled ? "opacity-30 cursor-default" : "cursor-pointer"}`}
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      <div className="flex items-center gap-1">
                        {/* Профайл */}
                        <div className="group relative inline-block">
                          <a href={baseUrl} className={btnCls}>
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                            </svg>
                          </a>
                          <span className={tooltipCls}>Профайл</span>
                        </div>
                        {/* Гүйцэтгэл (Dashboard) */}
                        <div className="group relative inline-block">
                          <a href={`${baseUrl}?tab=dashboard`} className={btnCls}>
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2 10a8 8 0 1116 0H2z" />
                              <path d="M10 2a8 8 0 00-8 8h8V2z" />
                            </svg>
                          </a>
                          <span className={tooltipCls}>Гүйцэтгэл</span>
                        </div>
                        {/* Хуваарь (Schedule) */}
                        <div className="group relative inline-block">
                          <a href={`${baseUrl}?tab=schedule`} className={btnCls}>
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                            </svg>
                          </a>
                          <span className={tooltipCls}>Хуваарь</span>
                        </div>
                        {/* Цагууд (Appointments) */}
                        <div className="group relative inline-block">
                          <a href={`${baseUrl}?tab=appointments`} className={btnCls}>
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                            </svg>
                          </a>
                          <span className={tooltipCls}>Цагууд</span>
                        </div>
                        {/* Борлуулалт (Sales) */}
                        <div className="group relative inline-block">
                          <a href={`${baseUrl}?tab=sales`} className={btnCls}>
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                          </a>
                          <span className={tooltipCls}>Борлуулалт</span>
                        </div>
                        {/* Түүх (History) */}
                        <div className="group relative inline-block">
                          <a href={`${baseUrl}?tab=history`} className={btnCls}>
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0V8.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L6.2 9.74a.75.75 0 101.1 1.02l1.95-2.1v4.59z" clipRule="evenodd" />
                            </svg>
                          </a>
                          <span className={tooltipCls}>Түүх</span>
                        </div>
                        {/* Нууц үг сэргээх */}
                        <SendResetLinkButton userId={d.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {doctors.length === 0 && (
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