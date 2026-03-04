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
          Зөвхөн нэр, утас, бүртгэсэн салбар заавал. Бусад мэдээллийг дараа нь
          профайлаас засварлаж болно.
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
              placeholder="Овог (сонголттой)"
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
              placeholder="Регистрийн дугаар (сонголттой)"
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
              Хүйсийг дараа нь профайлаас өөрчилж болно. Хоосон орхиж бас
              болно.
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
              Анхдагч утга нь &quot;Монгол&quot;. Шаардлагатай бол өөр улсын
              нэрийг оруулж болно.
            </span>
          </div>

          {/* Emergency phone */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Яаралтай үед холбоо барих утас
            </label>
            <input
              name="emergencyPhone"
              placeholder="Ж: 99112233"
              value={form.emergencyPhone}
              onChange={handleChange}
              className={inputCls}
            />
          </div>

          {/* Branch selection */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">
              Бүртгэсэн салбар<RequiredMark />
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
              Картын дугаар (сонголттой)
            </label>
            <input
              name="bookNumber"
              placeholder="Ж: 123456"
              value={form.bookNumber}
              onChange={handleChange}
              className={inputCls}
            />
            <span className="text-xs text-gray-400">
              Хоосон орхивол систем хамгийн сүүлийн дугаараас +1 автоматаар
              үүсгэнэ. 1-6 оронтой зөвхөн тоо байх ёстой.
            </span>
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

export default function PatientsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [bRes, pRes] = await Promise.all([
        fetch("/api/branches"),
        fetch("/api/patients"),
      ]);

      let bData: any = null;
      let pData: any = null;
      try {
        bData = await bRes.json();
      } catch {
        bData = null;
      }
      try {
        pData = await pRes.json();
      } catch {
        pData = null;
      }

      if (!bRes.ok || !Array.isArray(bData)) {
        throw new Error("branches load failed");
      }
      if (!pRes.ok || !Array.isArray(pData)) {
        throw new Error("patients load failed");
      }

      setBranches(bData);

      const sortedPatients = [...pData].sort((a: Patient, b: Patient) => {
        const aNum = a.patientBook?.bookNumber
          ? parseInt(a.patientBook.bookNumber, 10)
          : 0;
        const bNum = b.patientBook?.bookNumber
          ? parseInt(b.patientBook.bookNumber, 10)
          : 0;

        if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
          return bNum - aNum;
        }

        const aName = `${a.ovog || ""} ${a.name || ""}`.toString();
        const bName = `${b.ovog || ""} ${b.name || ""}`.toString();
        return aName.localeCompare(bName, "mn");
      });

      setPatients(sortedPatients);
    } catch (e) {
      console.error(e);
      setError("Өгөгдөл ачааллах үед алдаа гарлаа");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredPatients = patients.filter((p) => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return true;
    const name = `${p.ovog || ""} ${p.name || ""}`.toLowerCase();
    const regNo = (p.regNo || "").toLowerCase();
    const phone = (p.phone || "").toLowerCase();
    return name.includes(q) || regNo.includes(q) || phone.includes(q);
  });

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

  // ---- Summary metrics ----

  const totalPatients = patients.length;
  const totalMale = patients.filter((p) => p.gender === "эр").length;
  const totalFemale = patients.filter((p) => p.gender === "эм").length;

  // helper to compute age from birthDate iso string
  const calcAge = (birthDate?: string | null): number | null => {
    if (!birthDate) return null;
    const d = new Date(birthDate);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
      age--;
    }
    return age;
  };

  // kids: age <= 17
  const totalKids = patients.filter((p) => {
    const age = calcAge((p as any).birthDate);
    return age !== null && age <= 17;
  }).length;

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
          <div className="text-3xl font-bold mb-1">{totalPatients}</div>
          <div className="text-xs text-gray-600">
            Системд бүртгэлтэй нийт үйлчлүүлэгчийн тоо
          </div>
        </div>

        {/* 2. Male */}
        <div className="rounded-2xl p-4 bg-yellow-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-yellow-700 uppercase mb-1.5">
            ЭРЭГТЭЙ ҮЙЛЧЛҮҮЛЭГЧИД
          </div>
          <div className="text-3xl font-bold mb-1">{totalMale}</div>
          <div className="text-xs text-gray-600">
            Нийт эрэгтэй үйлчлүүлэгчдийн тоо
          </div>
        </div>

        {/* 3. Female */}
        <div className="rounded-2xl p-4 bg-red-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-red-700 uppercase mb-1.5">
            ЭМЭГТЭЙ ҮЙЛЧЛҮҮЛЭГЧИД
          </div>
          <div className="text-3xl font-bold mb-1">{totalFemale}</div>
          <div className="text-xs text-gray-600">
            Нийт эмэгтэй үйлчлүүлэгчдийн тоо
          </div>
        </div>

        {/* 4. Kids (≤17) */}
        <div className="rounded-2xl p-4 bg-green-100 shadow-sm">
          <div className="text-xs font-semibold tracking-wide text-green-700 uppercase mb-1.5">
            ХҮҮХЭД
          </div>
          <div className="text-3xl font-bold mb-1">{totalKids}</div>
          <div className="text-xs text-gray-600">
            17 ба түүнээс доош насны хүүхдийн тоо
          </div>
        </div>
      </section>

      <PatientRegisterForm
        branches={branches}
        onSuccess={(p) => {
          setPatients((prev) =>
            [...prev, p].sort((a: Patient, b: Patient) => {
              const aNum = a.patientBook?.bookNumber
                ? parseInt(a.patientBook.bookNumber, 10)
                : 0;
              const bNum = b.patientBook?.bookNumber
                ? parseInt(b.patientBook.bookNumber, 10)
                : 0;

              if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
                return bNum - aNum;
              }

              const aName = `${a.ovog || ""} ${a.name || ""}`.toString();
              const bName = `${b.ovog || ""} ${b.name || ""}`.toString();
              return aName.localeCompare(bName, "mn");
            })
          );
        }}
      />

      {/* Search section */}
      <section className="mb-4 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="text-base font-semibold mb-2">Хайлт</h2>
        <input
          placeholder="Нэр, РД, утасгаар хайх"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </section>

      {loading && (
        <p className="text-gray-500 text-sm">Ачааллаж байна...</p>
      )}
      {!loading && error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "#",
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
              {filteredPatients.map((p) => (
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
              {filteredPatients.length === 0 && (
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
      )}
    </main>
  );
}
