import React, { useEffect, useState } from "react";
import UsersTabs from "../../components/UsersTabs";

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
    <main className="p-6 font-sans">
      <h1>Эмч нар</h1>
      <p className="text-gray-500 mb-4">
        Эмч нарыг бүртгэх, салбарт хуваарьлах, профайлыг харах.
      </p>

      <UsersTabs />

      {/* summary cards */}
      <section className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-3 mb-4">
        <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-100 p-3 shadow">
          <div className="text-xs uppercase text-blue-700 font-bold tracking-wide mb-1">
            Нийт эмч
          </div>
          <div className="text-[26px] font-bold text-gray-900 mb-1">
            {summary ? summary.total : "—"}
          </div>
          <div className="text-xs text-gray-500">
            Системд бүртгэлтэй нийт эмчийн тоо.
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-100 to-white rounded-xl border border-green-200 p-3 shadow">
          <div className="text-xs uppercase text-green-700 font-bold tracking-wide mb-1">
            Өнөөдөр ажиллаж буй эмч
          </div>
          <div className="text-[26px] font-bold text-gray-900 mb-1">
            {summary ? summary.workingToday : "—"}
          </div>
          <div className="text-xs text-gray-500">
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

      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <table className="w-full border-collapse mt-5 text-sm">
          <thead>
            <tr>
              <th className="text-left border-b border-gray-200 p-2">#</th>
              <th className="text-left border-b border-gray-200 p-2">Овог</th>
              <th className="text-left border-b border-gray-200 p-2">Нэр</th>
              <th className="text-left border-b border-gray-200 p-2">РД</th>
              <th className="text-left border-b border-gray-200 p-2">Утас</th>
              <th className="text-left border-b border-gray-200 p-2">Салбар</th>
              <th className="text-left border-b border-gray-200 p-2">Дараалал</th>
              <th className="text-left border-b border-gray-200 p-2">Дэлгэрэнгүй</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((d, index) => (
              <tr key={d.id}>
                <td className="border-b border-gray-100 p-2">{index + 1}</td>
                <td className="border-b border-gray-100 p-2">{d.ovog || "-"}</td>
                <td className="border-b border-gray-100 p-2">{d.name || "-"}</td>
                <td className="border-b border-gray-100 p-2">{d.regNo || "-"}</td>
                <td className="border-b border-gray-100 p-2">{d.phone || "-"}</td>
                <td className="border-b border-gray-100 p-2">
                  {Array.isArray(d.branches) && d.branches.length > 0
                    ? d.branches.map((b) => b.name).join(", ")
                    : d.branch
                    ? d.branch.name
                    : "-"}
                </td>
                <td className="border-b border-gray-100 p-2">
                  {(() => {
                    const isUpDisabled = index === 0 || reorderSaving;
                    const isDownDisabled = index === doctors.length - 1 || reorderSaving;
                    return (
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
                    );
                  })()}
                </td>
                <td className="border-b border-gray-100 p-2 whitespace-nowrap">
                  <a
                    href={`/users/doctors/${d.id}`}
                    className="inline-block px-2 py-1 rounded border border-blue-600 text-blue-600 no-underline text-xs"
                  >
                    Профайл
                  </a>
                </td>
              </tr>
            ))}
            {doctors.length === 0 && (
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
