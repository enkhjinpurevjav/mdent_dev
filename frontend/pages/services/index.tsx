import React, { useEffect, useMemo, useState } from "react";

type Branch = {
  id: number;
  name: string;
};

type ServiceCategory =
  | "ORTHODONTIC_TREATMENT"
  | "IMAGING"
  | "DEFECT_CORRECTION"
  | "ADULT_TREATMENT"
  | "WHITENING"
  | "CHILD_TREATMENT"
  | "SURGERY"
  | "PREVIOUS";

type ServiceBranch = {
  branchId: number;
  branch: Branch;
};

type Service = {
  id: number;
  code?: string | null;
  category: ServiceCategory;
  name: string;
  price: number;
  isActive: boolean;
  description?: string | null;
  serviceBranches: ServiceBranch[];
};

type CategorySetting = {
  category: ServiceCategory;
  durationMinutes: number;
};

const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ORTHODONTIC_TREATMENT: "Гажиг заслын эмчилгээ",
  IMAGING: "Зураг авах",
  DEFECT_CORRECTION: "Согог засал",
  ADULT_TREATMENT: "Том хүний эмчилгээ",
  WHITENING: "Цайруулалт",
  CHILD_TREATMENT: "Хүүхдийн эмчилгээ",
  SURGERY: "Мэс засал",
  PREVIOUS: "Өмнөх",
};

const ALL_CATEGORIES = Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[];

export default function ServicesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // filters
  const [filterCategory, setFilterCategory] = useState<"" | ServiceCategory>("");
  const [filterBranchId, setFilterBranchId] = useState<number | "">("");
  const [filterOnlyActive, setFilterOnlyActive] = useState(true);
  const [filterSearch, setFilterSearch] = useState("");

  // create form
  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "" as "" | ServiceCategory,
    description: "",
    code: "",
    branchIds: [] as number[],
    isActive: true,
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    price: string;
    category: ServiceCategory | "";
    description: string;
    code: string;
    isActive: boolean;
    branchIds: number[];
  }>({
    name: "",
    price: "",
    category: "",
    description: "",
    code: "",
    isActive: true,
    branchIds: [],
  });
  const [editError, setEditError] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 30;

  // category duration settings
  const [categorySettings, setCategorySettings] = useState<
    Record<ServiceCategory, number>
  >({} as Record<ServiceCategory, number>);
  const [durationInputs, setDurationInputs] = useState<
    Record<ServiceCategory, string>
  >({} as Record<ServiceCategory, string>);
  const [durationSaving, setDurationSaving] = useState<
    Partial<Record<ServiceCategory, boolean>>
  >({});
  const [durationErrors, setDurationErrors] = useState<
    Partial<Record<ServiceCategory, string>>
  >({});
  const [durationSaved, setDurationSaved] = useState<
    Partial<Record<ServiceCategory, boolean>>
  >({});

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (filterCategory) params.set("category", filterCategory);
    if (filterBranchId) params.set("branchId", String(filterBranchId));
    if (filterOnlyActive) params.set("onlyActive", "true");
    return params.toString();
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const query = buildQuery();
      const [bRes, sRes] = await Promise.all([
        fetch("/api/branches"),
        fetch(`/api/services${query ? `?${query}` : ""}`),
      ]);

      const [bData, sData] = await Promise.all([bRes.json(), sRes.json()]);

      if (!bRes.ok || !Array.isArray(bData)) {
        throw new Error("branches load failed");
      }
      if (!sRes.ok || !Array.isArray(sData)) {
        throw new Error("services load failed");
      }

      setBranches(bData);
      setServices(
        [...sData].sort((a, b) =>
          a.name.toString().localeCompare(b.name.toString(), "mn")
        )
      );
      setPage(1);
    } catch (e) {
      console.error(e);
      setError("Өгөгдөл ачааллах үед алдаа гарлаа");
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategorySettings = async () => {
    try {
      const res = await fetch("/api/service-category-settings");
      if (!res.ok) return;
      const data: CategorySetting[] = await res.json();
      const settingsMap = {} as Record<ServiceCategory, number>;
      const inputsMap = {} as Record<ServiceCategory, string>;
      data.forEach(({ category, durationMinutes }) => {
        settingsMap[category] = durationMinutes;
        inputsMap[category] = String(durationMinutes);
      });
      // fill any missing categories with default
      ALL_CATEGORIES.forEach((cat) => {
        if (settingsMap[cat] === undefined) {
          settingsMap[cat] = 30;
          inputsMap[cat] = "30";
        }
      });
      setCategorySettings(settingsMap);
      setDurationInputs(inputsMap);
    } catch (err) {
      console.error("loadCategorySettings error:", err);
    }
  };

  useEffect(() => {
    loadAll();
    loadCategorySettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterBranchId, filterOnlyActive]);

  const handleSaveDuration = async (category: ServiceCategory) => {
    const rawVal = durationInputs[category];
    const val = Number(rawVal);
    if (!Number.isInteger(val) || val < 30) {
      setDurationErrors((prev) => ({
        ...prev,
        [category]: "Хамгийн бага 30 минут байх ёстой",
      }));
      return;
    }
    setDurationErrors((prev) => ({ ...prev, [category]: undefined }));
    setDurationSaving((prev) => ({ ...prev, [category]: true }));
    setDurationSaved((prev) => ({ ...prev, [category]: false }));
    try {
      const res = await fetch(`/api/service-category-settings/${category}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: val }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDurationErrors((prev) => ({
          ...prev,
          [category]: (data as any).error || "Хадгалах үед алдаа гарлаа",
        }));
      } else {
        setCategorySettings((prev) => ({ ...prev, [category]: val }));
        setDurationSaved((prev) => ({ ...prev, [category]: true }));
        setTimeout(() => {
          setDurationSaved((prev) => ({ ...prev, [category]: false }));
        }, 2000);
      }
    } catch (err) {
      console.error("handleSaveDuration error:", err);
      setDurationErrors((prev) => ({
        ...prev,
        [category]: "Сүлжээгээ шалгана уу",
      }));
    } finally {
      setDurationSaving((prev) => ({ ...prev, [category]: false }));
    }
  };

  const toggleCreateBranch = (branchId: number) => {
    setForm((prev) => {
      const has = prev.branchIds.includes(branchId);
      return {
        ...prev,
        branchIds: has
          ? prev.branchIds.filter((id) => id !== branchId)
          : [...prev.branchIds, branchId],
      };
    });
  };

  const toggleEditBranch = (branchId: number) => {
    setEditForm((prev) => {
      const has = prev.branchIds.includes(branchId);
      return {
        ...prev,
        branchIds: has
          ? prev.branchIds.filter((id) => id !== branchId)
          : [...prev.branchIds, branchId],
      };
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.name || !form.price || !form.category) {
      setFormError("Нэр, үнэ, категори талбаруудыг заавал бөглөнө үү.");
      return;
    }
    if (!form.branchIds.length) {
      setFormError("Ядаж нэг салбар сонгоно уу.");
      return;
    }
    if (Number.isNaN(Number(form.price)) || Number(form.price) <= 0) {
      setFormError("Үнийн дүн 0-ээс их тоо байх ёстой.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        price: Number(form.price),
        category: form.category,
        description: form.description || undefined,
        code: form.code || undefined,
        isActive: form.isActive,
        branchIds: form.branchIds,
      };

      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setServices((prev) =>
          [...prev, data].sort((a, b) =>
            a.name.toString().localeCompare(b.name.toString(), "mn")
          )
        );
        setForm({
          name: "",
          price: "",
          category: "",
          description: "",
          code: "",
          branchIds: [],
          isActive: true,
        });
        setFormError("");
        setPage(1);
      } else {
        setFormError(data.error || "Үйлчилгээ хадгалах үед алдаа гарлаа.");
      }
    } catch {
      setFormError("Сүлжээгээ шалгана уу.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (s: Service) => {
    setEditingId(s.id);
    setEditError("");
    setEditForm({
      name: s.name,
      price: String(s.price),
      category: s.category,
      description: s.description || "",
      code: s.code || "",
      isActive: s.isActive,
      branchIds: s.serviceBranches?.map((sb) => sb.branchId) || [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError("");
  };

  const handleEditChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type, checked } = e.target as any;
    if (type === "checkbox" && name === "isActive") {
      setEditForm((prev) => ({ ...prev, isActive: checked }));
      return;
    }
    setEditForm((prev) => ({
      ...prev,
      [name]: name === "category" ? (value as ServiceCategory) : value,
    }));
  };

  const saveEdit = async (id: number) => {
    setEditError("");

    if (!editForm.name || !editForm.price || !editForm.category) {
      setEditError("Нэр, үнэ, категори шаардлагатай.");
      return;
    }
    if (!editForm.branchIds.length) {
      setEditError("Ядаж нэг салбар сонгоно уу.");
      return;
    }
    if (Number.isNaN(Number(editForm.price)) || Number(editForm.price) <= 0) {
      setEditError("Үнийн дүн 0-ээс их тоо байх ёстой.");
      return;
    }

    try {
      const payload: any = {
        name: editForm.name,
        price: Number(editForm.price),
        category: editForm.category,
        description: editForm.description || null,
        code: editForm.code || null,
        isActive: editForm.isActive,
        branchIds: editForm.branchIds,
      };

      const res = await fetch(`/api/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Хадгалах үед алдаа гарлаа.");
        return;
      }

      setServices((prev) =>
        [...prev].map((s) => (s.id === id ? data : s)).sort((a, b) =>
          a.name.toString().localeCompare(b.name.toString(), "mn")
        )
      );
      setEditingId(null);
      setEditError("");
    } catch (err) {
      console.error(err);
      setEditError("Сүлжээгээ шалгана уу.");
    }
  };

  const deleteService = async (id: number) => {
    const ok = window.confirm(
      "Та энэхүү үйлчилгээг устгахдаа итгэлтэй байна уу?"
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/services/${id}`, {
        method: "DELETE",
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        alert((data && data.error) || "Устгах үед алдаа гарлаа");
        return;
      }

      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
      alert("Сүлжээгээ шалгана уу");
    }
  };

  // Filter + search + pagination
  const filteredServices = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return services;

    return services.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const code = (s.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [services, filterSearch]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredServices.length / pageSize)
  );
  const safePage = Math.min(page, totalPages);
  const pagedServices = useMemo(
    () =>
      filteredServices.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize
      ),
    [filteredServices, safePage]
  );

  const [collapsedCategories, setCollapsedCategories] = useState<
    Partial<Record<ServiceCategory, boolean>>
  >({});

  const toggleCategory = (cat: ServiceCategory) =>
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const servicesByCategory = useMemo(() => {
    const groups: Record<ServiceCategory, Service[]> = {
      ORTHODONTIC_TREATMENT: [],
      IMAGING: [],
      DEFECT_CORRECTION: [],
      ADULT_TREATMENT: [],
      WHITENING: [],
      CHILD_TREATMENT: [],
      SURGERY: [],
      PREVIOUS: [],
    };
    pagedServices.forEach((s) => {
      groups[s.category].push(s);
    });
    return groups;
  }, [pagedServices]);

  return (
    <main className="w-full px-6 py-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Үйлчилгээ</h1>
      <p className="text-sm text-gray-500 mb-4">
        Үйлчилгээний нэр, үнэ, категори болон салбаруудыг бүртгэх, засварлах.
      </p>

      {/* Create service form */}
      <section className="mb-4 p-4 rounded-lg border border-gray-200 bg-white">
        <h2 className="text-base font-semibold mb-1">Шинэ үйлчилгээ бүртгэх</h2>
        <p className="text-xs text-gray-500 mb-3">
          Зөвхөн нэр, үнэ, категори болон салбарыг заавал бөглөнө. Код, тайлбар
          талбарууд сонголттой.
        </p>

        <form onSubmit={handleCreateSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-2.5 text-sm">
            <div className="flex flex-col gap-1">
              <label>Нэр</label>
              <input
                placeholder="Ж: Шүдний цоорхой пломбдох"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                className="rounded border border-gray-300 px-2 py-1.5"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label>Үнэ (₮)</label>
              <input
                type="number"
                placeholder="Ж: 50000"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
                required
                className="rounded border border-gray-300 px-2 py-1.5"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label>Категори</label>
              <select
                value={form.category || ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value
                      ? (e.target.value as ServiceCategory)
                      : "",
                  }))
                }
                required
                className="rounded border border-gray-300 px-2 py-1.5"
              >
                <option value="">Категори сонгох</option>
                {Object.entries(SERVICE_CATEGORY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label>Код</label>
              <input
                placeholder="Ж: S0001 (хоосон бол автоматаар үүснэ)"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value }))
                }
                className="rounded border border-gray-300 px-2 py-1.5"
              />
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
              <label>Тайлбар</label>
              <textarea
                placeholder="Ж: Энгийн цоорхой пломбдолт, мэдээ алдуулалттай"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
                rows={2}
                className="rounded border border-gray-300 px-2 py-1.5 resize-y"
              />
            </div>

            {/* branch selection */}
            <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1">
              <label>Салбарууд</label>
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <label
                    key={b.id}
                    className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs cursor-pointer ${
                      form.branchIds.includes(b.id)
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-300 text-gray-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.branchIds.includes(b.id)}
                      onChange={() => toggleCreateBranch(b.id)}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>

            <label className="inline-flex items-center gap-1.5 mt-1">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
              />
              Идэвхтэй
            </label>
          </div>

          <div className="flex justify-end gap-2 items-center">
            {formError && (
              <div className="text-red-700 text-xs mr-auto">{formError}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded border-none bg-blue-600 text-white text-sm cursor-pointer disabled:opacity-60"
            >
              {submitting ? "Хадгалж байна..." : "Бүртгэх"}
            </button>
          </div>
        </form>

        {/* Category duration settings */}
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold mb-2">
            Категорийн хугацаа (минут)
          </h3>
          <div className="space-y-2">
            {ALL_CATEGORIES.map((cat) => {
              const inputVal =
                durationInputs[cat] !== undefined
                  ? durationInputs[cat]
                  : String(categorySettings[cat] ?? 30);
              const isSaving = !!durationSaving[cat];
              const errMsg = durationErrors[cat];
              const isSaved = !!durationSaved[cat];

              return (
                <div
                  key={cat}
                  className="flex items-center gap-3 text-sm flex-wrap"
                >
                  <span className="w-52 text-gray-700">
                    {SERVICE_CATEGORY_LABELS[cat]}
                  </span>
                  <input
                    type="number"
                    min={30}
                    value={inputVal}
                    onChange={(e) =>
                      setDurationInputs((prev) => ({
                        ...prev,
                        [cat]: e.target.value,
                      }))
                    }
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <span className="text-gray-500 text-xs">мин</span>
                  <button
                    type="button"
                    onClick={() => handleSaveDuration(cat)}
                    disabled={isSaving}
                    className="px-2.5 py-1 rounded border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                  >
                    {isSaving ? "..." : "Хадгалах"}
                  </button>
                  {isSaved && (
                    <span className="text-green-600 text-xs">✓ Хадгаллаа</span>
                  )}
                  {errMsg && (
                    <span className="text-red-600 text-xs">{errMsg}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Filters card */}
      <section className="mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
        <h2 className="text-base font-semibold mt-0 mb-2">Шүүлтүүр</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-sm mb-2">
          <div className="flex flex-col gap-1">
            <label>Категори</label>
            <select
              value={filterCategory}
              onChange={(e) =>
                setFilterCategory(
                  e.target.value ? (e.target.value as ServiceCategory) : ""
                )
              }
              className="rounded border border-gray-300 px-2 py-1.5"
            >
              <option value="">Бүгд</option>
              {Object.entries(SERVICE_CATEGORY_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label>Салбар</label>
            <select
              value={filterBranchId === "" ? "" : String(filterBranchId)}
              onChange={(e) =>
                setFilterBranchId(
                  e.target.value ? Number(e.target.value) : ""
                )
              }
              className="rounded border border-gray-300 px-2 py-1.5"
            >
              <option value="">Бүгд</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 mt-5">
            <input
              type="checkbox"
              id="onlyActive"
              checked={filterOnlyActive}
              onChange={(e) => setFilterOnlyActive(e.target.checked)}
            />
            <label htmlFor="onlyActive">Зөвхөн идэвхтэй</label>
          </div>
        </div>

        <input
          placeholder="Нэр, кодоор хайх..."
          value={filterSearch}
          onChange={(e) => {
            setFilterSearch(e.target.value);
            setPage(1);
          }}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </section>

      {loading && (
        <div className="text-gray-600 text-sm">Ачааллаж байна...</div>
      )}
      {!loading && error && (
        <div className="text-red-700 text-sm mb-3">{error}</div>
      )}

      {/* Services list */}
      {!loading && !error && (
        <section>
          <h2 className="text-base font-semibold mb-2">
            Бүртгэлтэй үйлчилгээ
          </h2>
          {editError && (
            <div className="text-red-700 text-xs mb-2">{editError}</div>
          )}
          {filteredServices.length === 0 ? (
            <div className="text-gray-400 text-sm">Үйлчилгээ алга.</div>
          ) : (
            <>
              <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {[
                        "#",
                        "Код",
                        "Нэр",
                        "Категори",
                        "Үнэ (₮)",
                        "Салбарууд",
                        "Төлөв",
                        "Үйлдэл",
                      ].map((label) => (
                        <th
                          key={label}
                          className={`sticky top-0 bg-gray-50 border-b border-gray-300 p-2 z-10 ${
                            label === "Үнэ (₮)" ? "text-right" : "text-left"
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      Object.entries(servicesByCategory) as [
                        ServiceCategory,
                        Service[]
                      ][]
                    ).map(([category, list]) => {
                      if (!list.length) return null;
                      const isCollapsed = !!collapsedCategories[category];
                      const label =
                        SERVICE_CATEGORY_LABELS[category] || category;

                      return (
                        <React.Fragment key={category}>
                          {/* Category header row */}
                          <tr>
                            <td
                              colSpan={8}
                              className="bg-gray-100 border-b border-gray-200 p-2 font-semibold cursor-pointer text-sm"
                              onClick={() => toggleCategory(category)}
                            >
                              {isCollapsed ? "▶" : "▼"} {label}{" "}
                              <span className="text-gray-500 font-normal">
                                ({list.length})
                              </span>
                            </td>
                          </tr>

                          {!isCollapsed &&
                            list.map((s, index) => {
                              const isEditing = editingId === s.id;

                              if (isEditing) {
                                return (
                                  <tr key={s.id}>
                                    <td className="border-b border-gray-100 p-2">
                                      {(safePage - 1) * pageSize + index + 1}
                                    </td>
                                    <td className="border-b border-gray-100 p-2">
                                      <input
                                        name="code"
                                        value={editForm.code}
                                        onChange={handleEditChange}
                                        className="w-full border border-gray-300 rounded px-1.5 py-0.5"
                                        placeholder="Код"
                                      />
                                    </td>
                                    <td className="border-b border-gray-100 p-2">
                                      <input
                                        name="name"
                                        value={editForm.name}
                                        onChange={handleEditChange}
                                        className="w-full border border-gray-300 rounded px-1.5 py-0.5"
                                        placeholder="Нэр"
                                      />
                                    </td>
                                    <td className="border-b border-gray-100 p-2">
                                      <select
                                        name="category"
                                        value={editForm.category}
                                        onChange={handleEditChange}
                                        className="w-full border border-gray-300 rounded px-1.5 py-0.5"
                                      >
                                        <option value="">Категори</option>
                                        {Object.entries(
                                          SERVICE_CATEGORY_LABELS
                                        ).map(([value, label]) => (
                                          <option
                                            key={value}
                                            value={value}
                                          >
                                            {label}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="border-b border-gray-100 p-2 text-right">
                                      <input
                                        name="price"
                                        type="number"
                                        value={editForm.price}
                                        onChange={handleEditChange}
                                        className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-right"
                                        placeholder="Үнэ"
                                      />
                                    </td>
                                    <td className="border-b border-gray-100 p-2">
                                      <div className="flex flex-wrap gap-1">
                                        {branches.map((b) => (
                                          <label
                                            key={b.id}
                                            className="inline-flex items-center gap-1 border border-gray-300 rounded px-1.5 py-0.5 text-xs cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={editForm.branchIds.includes(
                                                b.id
                                              )}
                                              onChange={() =>
                                                toggleEditBranch(b.id)
                                              }
                                            />
                                            {b.name}
                                          </label>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="border-b border-gray-100 p-2 text-center">
                                      <label className="text-sm">
                                        <input
                                          type="checkbox"
                                          name="isActive"
                                          checked={editForm.isActive}
                                          onChange={handleEditChange}
                                        />{" "}
                                        Идэвхтэй
                                      </label>
                                    </td>
                                    <td className="border-b border-gray-100 p-2 whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => saveEdit(s.id)}
                                        className="mr-2 px-1.5 py-0.5 text-xs border border-gray-300 rounded cursor-pointer hover:bg-gray-50"
                                      >
                                        Хадгалах
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="px-1.5 py-0.5 text-xs border border-gray-300 rounded cursor-pointer hover:bg-gray-50"
                                      >
                                        Цуцлах
                                      </button>
                                    </td>
                                  </tr>
                                );
                              }

                              return (
                                <tr key={s.id}>
                                  <td className="border-b border-gray-100 p-2">
                                    {(safePage - 1) * pageSize + index + 1}
                                  </td>
                                  <td className="border-b border-gray-100 p-2">
                                    {s.code || "-"}
                                  </td>
                                  <td className="border-b border-gray-100 p-2">
                                    {s.name}
                                  </td>
                                  <td className="border-b border-gray-100 p-2">
                                    {SERVICE_CATEGORY_LABELS[s.category] ||
                                      s.category}
                                  </td>
                                  <td className="border-b border-gray-100 p-2 text-right">
                                    {s.price.toLocaleString("mn-MN")}
                                  </td>
                                  <td className="border-b border-gray-100 p-2">
                                    {s.serviceBranches?.length
                                      ? s.serviceBranches
                                          .map((sb) => sb.branch.name)
                                          .join(", ")
                                      : "-"}
                                  </td>
                                  <td className="border-b border-gray-100 p-2 text-center">
                                    {s.isActive ? "Идэвхтэй" : "Идэвхгүй"}
                                  </td>
                                  <td className="border-b border-gray-100 p-2 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(s)}
                                      className="mr-2 px-1.5 py-0.5 text-xs border border-gray-300 rounded cursor-pointer hover:bg-gray-50"
                                    >
                                      Засах
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteService(s.id)}
                                      className="px-1.5 py-0.5 text-xs border border-red-700 rounded text-red-700 cursor-pointer hover:bg-red-50"
                                    >
                                      Устгах
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}

                    {filteredServices.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center text-gray-400 p-3"
                        >
                          Өгөгдөл алга
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredServices.length > pageSize && (
                <div className="mt-2 flex justify-between items-center text-sm text-gray-600">
                  <span>
                    Нийт {filteredServices.length} үйлчилгээ — {safePage}/
                    {totalPages} хуудас
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className={`px-2 py-1 rounded border border-gray-300 text-gray-800 ${
                        safePage === 1
                          ? "bg-gray-50 cursor-default"
                          : "bg-white cursor-pointer hover:bg-gray-50"
                      }`}
                    >
                      Өмнөх
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={safePage === totalPages}
                      className={`px-2 py-1 rounded border border-gray-300 text-gray-800 ${
                        safePage === totalPages
                          ? "bg-gray-50 cursor-default"
                          : "bg-white cursor-pointer hover:bg-gray-50"
                      }`}
                    >
                      Дараах
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
