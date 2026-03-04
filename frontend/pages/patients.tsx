import React, { useState, useEffect } from "react";

type Branch = {
  id: number;
  name: string;
};

type Patient = {
  id: number;
  ovog?: string | null;
  name: string;
  regNo?: string | null;
  phone?: string | null;
  branchId: number;
  branch?: Branch;
  patientBook?: { bookNumber: string } | null;
  createdAt?: string;
  gender?: string | null;
  birthDate?: string | null;
};

const inputCls =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function RequiredMark() {
  return <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>;
}

function PatientRegisterForm({
  branches,
  onSuccess,
}: {
  branches: Branch[];
  onSuccess: (p: Patient) => void;
}) {
  const [form, setForm] = useState({
    ovog: "",
    name: "",
    regNo: "",
    phone: "",
    branchId: "",
    bookNumber: "",
    gender: "", // "" | "эр" | "эм"
    citizenship: "Монгол",
    emergencyPhone: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenderChange = (value: "" | "эр" | "эм") => {
    setForm((prev) => ({ ...prev, gender: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Minimal required: name, phone, branchId
    if (!form.name || !form.phone) {
      setError("Нэр болон утас заавал бөглөнө үү.");
      return;
    }
    if (!form.branchId) {
      setError("Салбар сонгоно уу.");
      return;
    }

    // Optional client-side validation: card number if filled
    if (form.bookNumber && !/^\d{1,6}$/.test(form.bookNumber)) {
      setError("Картын дугаар нь 1-6 оронтой зөвхөн тоо байх ёстой.");
      return;
    }

    // Gender is optional but if present must be "эр" or "эм"
    if (form.gender && form.gender !== "эр" && form.gender !== "эм") {
      setError("Хүйс талбарт зөвхөн 'эр' эсвэл 'эм' утга сонгох боломжтой.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ovog: form.ovog || null,
        name: form.name,
        regNo: form.regNo || null,
        phone: form.phone,
        branchId: Number(form.branchId),
        bookNumber: form.bookNumber || "",
        gender: form.gender || null, // optional, null when empty
        citizenship: form.citizenship?.trim() || null,
        emergencyPhone: form.emergencyPhone?.trim() || null,
      };

      const res = await fetch("/api/patients", {
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

      if (res.ok) {
        onSuccess(data);
        setForm({
          ovog: "",
          name: "",
          regNo: "",
          phone: "",
          branchId: "",
          bookNumber: "",
          gender: "",
          citizenship: "Монгол",
          emergencyPhone: "",
        });
      } else {
        setError((data && data.error) || "Алдаа гарлаа");
      }
    } catch {
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-2 mb-4 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Шинэ үйлчлүүлэгч бүртгэх
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          (Яаралтай бүртгэл үүсгэх үед зөвхөн нэр, утасны дугаар болон үндсэн салбарыг заавал бөглөх шаардлагатай ба бусад мэдээллийг 
          профайлаас нэмж оруулна)
        </p>
      </div>

      <form className="p-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          {/* Овог */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Овог
            </label>
            <input
              name="ovog"
              placeholder="Овог"
              value={form.ovog}
              onChange={handleChange}
              className={inputCls}
            />
          </div>

          {/* Нэр */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Нэр<RequiredMark />
            </label>
            <input
              name="name"
              placeholder="Нэр"
              value={form.name}
              onChange={handleChange}
              required
              className={inputCls}
            />
          </div>

          {/* РД */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Регистрийн дугаар
            </label>
            <input
              name="regNo"
              placeholder="Регистрийн дугаар"
              value={form.regNo}
              onChange={handleChange}
              className={inputCls}
            />
          </div>

          {/* Утас */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Утасны дугаар<RequiredMark />
            </label>
            <input
              name="phone"
              placeholder="Утас"
              value={form.phone}
              onChange={handleChange}
              required
              className={inputCls}
            />
          </div>

          {/* Gender */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Хүйс</label>
            <div className="flex gap-3 items-center text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="gender"
                  value="эр"
                  checked={form.gender === "эр"}
                  onChange={() => handleGenderChange("эр")}
                />
                <span>Эр</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="gender"
                  value="эм"
                  checked={form.gender === "эм"}
                  onChange={() => handleGenderChange("эм")}
                />
                <span>Эм</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="gender"
                  value=""
                  checked={form.gender === ""}
                  onChange={() => handleGenderChange("")}
                />
                <span>Хоосон</span>
              </label>
            </div>
            <span className="text-xs text-gray-400">
              Хүйсийг профайлаас өөрчилж болно. 
            </span>
          </div>

          {/* Citizenship */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Иргэншил
            </label>
            <input
              name="citizenship"
              placeholder="Монгол"
              value={form.citizenship}
              onChange={handleChange}
              className={inputCls}
            />
            <span className="text-xs text-gray-400">
              Гадаад улсын иргэн бол улсын
              нэрийг оруулна уу
            </span>
          </div>

          {/* Emergency phone */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Яаралтай үед холбоо барих утас
            </label>
            <input
              name="emergencyPhone"
              placeholder="Утас"
              value={form.emergencyPhone}
              onChange={handleChange}
              className={inputCls}
            />
          </div>

          {/* Branch selection */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Үндсэн салбар<RequiredMark />
            </label>
            <select
              name="branchId"
              value={form.branchId}
              onChange={handleChange}
              required
              className={inputCls}
            >
              <option value="">Салбар сонгох</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Optional manual book number */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Картын дугаар
            </label>
            <input
              name="bookNumber"
              placeholder="Ж: 123456"
              value={form.bookNumber}
              onChange={handleChange}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex justify-end items-center gap-2">
          {error && (
            <p className="text-red-700 text-xs mr-auto">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            {submitting ? "Бүртгэж байна..." : "Бүртгэх"}
          </button>
        </div>
      </form>
    </section>
  );
}

function getPageNumbers(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (page >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", page - 1, page, page + 1, "...", totalPages];
}

export default function PatientsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState("bookNumber");
  const [dir, setDir] = useState("desc");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalMale, setTotalMale] = useState(0);
  const [totalFemale, setTotalFemale] = useState(0);
  const [totalKids, setTotalKids] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPatients = async (q: string, currentPage: number, currentLimit: number, currentSort: string, currentDir: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page", String(currentPage));
      params.set("limit", String(currentLimit));
      params.set("sort", currentSort);
      params.set("dir", currentDir);

      const pRes = await fetch(`/api/patients?${params}`);
      let pData: any = null;
      try {
        pData = await pRes.json();
      } catch {
        pData = null;
      }

      if (!pRes.ok || !pData || !Array.isArray(pData.data)) {
        throw new Error("patients load failed");
      }

      setPatients(pData.data);
      setTotal(pData.total);
      setTotalPages(pData.totalPages);
      setTotalMale(pData.totalMale ?? 0);
      setTotalFemale(pData.totalFemale ?? 0);
      setTotalKids(pData.totalKids ?? 0);
    } catch (e) {
      console.error(e);
      setError("Өгөгдөл ачааллах үед алдаа гарлаа");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setBranches(d); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadPatients(debouncedSearch, page, limit, sort, dir);
  }, [debouncedSearch, page, limit, sort, dir, refreshKey]);

  const getBranchName = (branchId: number) => {
    const b = branches.find((br) => br.id === branchId);
    return b ? b.name : branchId;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("mn-MN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <main className="max-w-7xl px-4 lg:px-8 my-4 font-sans">
      <h1 className="text-2xl font-bold mt-1 mb-2">
        Үйлчлүүлэгчийн бүртгэл
      </h1>

      {/* Summary cards row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* 1. Total patients */}
        <div className="rounded-2xl p-4 bg-blue-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-blue-700 uppercase mb-1.5">
            НИЙТ ҮЙЛЧЛҮҮЛЭГЧИД
          </div>
          <div className="text-3xl font-bold mb-1">{total}</div>
          <div className="text-xs text-gray-600">
            Системд бүртгэлтэй нийт үйлчлүүлэгчийн тоо
          </div>
        </div>

        {/* 2. Male */}
        <div className="rounded-2xl p-4 bg-yellow-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-yellow-700 uppercase mb-1.5">
            ЭРЭГТЭЙ ҮЙЛЧЛҮҮЛЭГЧИД
          </div>
          <div className="text-3xl font-bold mb-1">
            {totalMale}
          </div>
          <div className="text-xs text-gray-600">
            Нийт эрэгтэй үйлчлүүлэгчдийн тоо
          </div>
        </div>

        {/* 3. Female */}
        <div className="rounded-2xl p-4 bg-red-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-red-700 uppercase mb-1.5">
            ЭМЭГТЭЙ ҮЙЛЧЛҮҮЛЭГЧИД
          </div>
          <div className="text-3xl font-bold mb-1">
            {totalFemale}
          </div>
          <div className="text-xs text-gray-600">
            Нийт эмэгтэй үйлчлүүлэгчдийн тоо
          </div>
        </div>

        {/* 4. Kids (≤17) */}
        <div className="rounded-2xl p-4 bg-green-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-green-700 uppercase mb-1.5">
            ХҮҮХЭД
          </div>
          <div className="text-3xl font-bold mb-1">
            {totalKids}
          </div>
          <div className="text-xs text-gray-600">
            17 ба түүнээс доош насны хүүхдийн тоо
          </div>
        </div>
      </section>

      <PatientRegisterForm
        branches={branches}
        onSuccess={() => {
          setSearch("");
          setDebouncedSearch("");
          setPage(1);
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Search section */}
      <section className="mb-4 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="text-base font-semibold mb-2">Хайлт</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            placeholder="Овог, Нэр, РД, утас болон картын дугаараар хайх"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 p-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={`${sort}_${dir}`}
            onChange={(e) => {
              const [s, d] = e.target.value.split("_");
              setSort(s);
              setDir(d);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
          >
            <option value="bookNumber_desc">Картын дугаар буурахаар</option>
            <option value="bookNumber_asc">Картын дугаар өсөхөөр</option>
            <option value="name_asc">Нэр өсөхөөр</option>
            <option value="name_desc">Нэр буурахаар</option>
          </select>
        </div>
      </section>

      {loading && (
        <p className="text-gray-500 text-sm">Ачааллаж байна...</p>
      )}
      {!loading && error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Картын дугаар",
                    "Овог",
                    "Нэр",
                    "РД",
                    "Утас",
                    "Үүсгэсэн",
                    "Бүртгэсэн салбар",
                    "Үйлдэл",
                  ].map((label) => (
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
                {patients.map((p) => (
                  <tr key={p.id} className="odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                    <td className="border-b border-gray-100 py-2 px-3">
                      {p.patientBook?.bookNumber || "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {p.ovog || "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {p.name || "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {p.regNo || "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {p.phone || "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {getBranchName(p.branchId)}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {p.patientBook?.bookNumber ? (
                        <a
                          href={`/patients/${encodeURIComponent(
                            p.patientBook.bookNumber
                          )}`}
                          className="text-xs px-2 py-1 rounded border border-gray-300 no-underline text-gray-900 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          Дэлгэрэнгүй
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center text-gray-400 py-6 text-sm"
                    >
                      {debouncedSearch
                        ? `"${debouncedSearch}" — тохирох үйлчлүүлэгч олдсонгүй`
                        : "Өгөгдөл алга"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination + Items per page (bottom, right-aligned) */}
          <div className="flex items-center justify-end mt-4 flex-wrap gap-3">
            {/* Items per page */}
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <label htmlFor="limit-select" className="whitespace-nowrap">
                1 хуудсанд харагдах үйлчлүүлэгчдийн тоо
              </label>
              <select
                id="limit-select"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {/* Page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Өмнөх
                </button>
                {getPageNumbers(page, totalPages).map((item, idx) =>
                  item === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-sm text-gray-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                        item === page
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Дараах
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
