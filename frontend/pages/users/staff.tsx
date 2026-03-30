import React, { useEffect, useState } from "react";
import UsersTabs from "../../components/UsersTabs";
import SendResetLinkButton from "../../components/SendResetLinkButton";

type Branch = {
  id: number;
  name: string;
};

type UserRole = "accountant" | "manager" | "admin" | "super_admin" | "sterilization" | "other" | "receptionist" | "nurse" | "xray";

type OtherStaff = {
  id: number;
  email: string;
  name?: string | null;
  ovog?: string | null;
  role: UserRole | string;
  regNo?: string | null;
  phone?: string | null;
  branchId?: number | null;
  branch?: Branch | null;
  branches?: Branch[];
  createdAt?: string;
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "accountant", label: "Нягтлан" },
  { value: "manager", label: "Менежер" },
  { value: "admin", label: "Админ" },
  { value: "super_admin", label: "Супер Админ" },
  { value: "sterilization", label: "Ариутгал" },
  { value: "other", label: "Бусад" },
  { value: "receptionist", label: "Ресепшн" },
  { value: "nurse", label: "Сувилагч" },
  { value: "xray", label: "Рентген" },
];

const getRoleLabel = (role: string) => {
  switch (role) {
    case "accountant":
      return "Нягтлан";
    case "manager":
      return "Менежер";
    case "admin":
      return "Админ";
    case "super_admin":
      return "Супер Админ";
    case "sterilization":
      return "Ариутгал";
    case "other":
      return "Бусад";
    case "xray":
      return "Рентген";
    default:
      return role;
  }
};

function OtherStaffForm({
  branches,
  onSuccess,
}: {
  branches: Branch[];
  onSuccess: (u: OtherStaff) => void;
}) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    ovog: "",
    regNo: "",
    phone: "",
    role: "" as "" | UserRole,
    branchIds: [] as number[],
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "role"
          ? (value as UserRole | "")
          : value,
    }));
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

    if (!form.role) {
      setError("Үүрэг сонгоно уу.");
      return;
    }

    setSubmitting(true);

    try {
      const primaryBranchId =
        form.branchIds.length > 0 ? form.branchIds[0] : undefined;

      const payload: any = {
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        ovog: form.ovog || undefined,
        role: form.role,
        branchId: primaryBranchId,
        phone: form.phone || undefined,
      };

      if (form.regNo.trim()) {
        payload.regNo = form.regNo.trim();
      }

      // 1) create user
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

      const createdUser = data as OtherStaff;

      // 2) assign multiple branches via /api/users/:id/branches
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
        } catch (e) {
          console.error("Failed to assign multiple branches", e);
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
        role: "",
        branchIds: [],
      });
    } catch {
      setError("Сүлжээгээ шалгана уу");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Шинэ ажилтан бүртгэх</h2>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2 mb-3">
        <input
          name="ovog"
          placeholder="Овог"
          value={form.ovog}
          onChange={handleChange}
          required
          className={inputCls}
        />
        <input
          name="name"
          placeholder="Нэр"
          value={form.name}
          onChange={handleChange}
          required
          className={inputCls}
        />
        <input
          name="regNo"
          placeholder="РД"
          value={form.regNo}
          onChange={handleChange}
          className={inputCls}
        />
        <input
          name="phone"
          placeholder="Утас"
          value={form.phone}
          onChange={handleChange}
          className={inputCls}
        />
        <input
          name="email"
          type="email"
          placeholder="И-мэйл"
          value={form.email}
          onChange={handleChange}
          required
          className={inputCls}
        />
        <input
          name="password"
          type="password"
          placeholder="Нууц үг"
          value={form.password}
          onChange={handleChange}
          required
          className={inputCls}
        />
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          required
          className={inputCls}
        >
          <option value="">Үүрэг сонгох</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <span className="text-sm font-medium text-gray-700 shrink-0">Салбар сонгох</span>
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          {branches.map((b) => (
            <label
              key={b.id}
              className="cursor-pointer select-none inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 has-[:focus-visible]:ring-offset-1"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={form.branchIds.includes(b.id)}
                onChange={() => handleBranchToggle(b.id)}
              />
              {b.name}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
        >
          {submitting ? "Бүртгэж байна..." : "Бүртгэх"}
        </button>
      </div>

      {error && <div className="text-red-600 mt-2 text-sm">{error}</div>}
    </form>
  );
}

export default function OtherStaffPage() {
  const [users, setUsers] = useState<OtherStaff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    ovog: string;
    regNo: string;
    phone: string;
    branchId: number | null;
    editBranchIds: number[];
  }>({
    name: "",
    ovog: "",
    regNo: "",
    phone: "",
    branchId: null,
    editBranchIds: [],
  });

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

  // load all "other staff" roles
  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      // fetch each role then merge
      const roles: UserRole[] = ["accountant", "manager", "admin", "super_admin", "sterilization", "other", "receptionist", "nurse", "xray"];
      const results: OtherStaff[] = [];

      for (const role of roles) {
        const res = await fetch(`/api/users?role=${role}`);
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (res.ok && Array.isArray(data)) {
          results.push(...data);
        }
      }

      // sort by name only
      const sorted = [...results].sort((a, b) => {
        const aName = (a.name || "").toString();
        const bName = (b.name || "").toString();
        return aName.localeCompare(bName, "mn");
      });

      setUsers(sorted);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Сүлжээгээ шалгана уу");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
    loadUsers();
  }, []);

  const startEdit = (u: OtherStaff) => {
    setEditingId(u.id);

    const currentBranchIds =
      Array.isArray(u.branches) && u.branches.length > 0
        ? u.branches.map((b) => b.id)
        : u.branch
        ? [u.branch.id]
        : [];

    setEditForm({
      name: u.name || "",
      ovog: u.ovog || "",
      regNo: u.regNo || "",
      phone: u.phone || "",
      branchId: u.branchId ?? (u.branch ? u.branch.id : null),
      editBranchIds: currentBranchIds,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]:
        name === "branchId"
          ? value
            ? Number(value)
            : null
          : value,
    }));
  };

  const handleEditBranchToggle = (branchId: number) => {
    setEditForm((prev) => {
      const exists = prev.editBranchIds.includes(branchId);
      const next = exists
        ? prev.editBranchIds.filter((id) => id !== branchId)
        : [...prev.editBranchIds, branchId];

      const nextPrimary = next.length > 0 ? next[0] : null;

      return {
        ...prev,
        editBranchIds: next,
        branchId: nextPrimary,
      };
    });
  };

  const saveEdit = async (id: number) => {
    try {
      const payload: any = {
        name: editForm.name || null,
        ovog: editForm.ovog || null,
        regNo: editForm.regNo || null,
        phone: editForm.phone || null,
        branchId: editForm.branchId || null,
      };

      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let userData: any = null;
      try {
        userData = await res.json();
      } catch {
        userData = null;
      }

      if (!res.ok || !userData || !userData.id) {
        alert((userData && userData.error) || "Хадгалах үед алдаа гарлаа");
        return;
      }

      const branchesPayload = { branchIds: editForm.editBranchIds };

      const resBranches = await fetch(`/api/users/${id}/branches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branchesPayload),
      });

      let branchesResult: any = null;
      try {
        branchesResult = await resBranches.json();
      } catch {
        branchesResult = null;
      }

      if (!resBranches.ok) {
        alert(
          (branchesResult && branchesResult.error) ||
            "Салбар хадгалах үед алдаа гарлаа"
        );
        return;
      }

      const updatedBranches =
        branchesResult && Array.isArray(branchesResult.branches)
          ? branchesResult.branches
          : userData.branches || [];

      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                name: userData.name,
                ovog: userData.ovog,
                regNo: userData.regNo,
                phone: userData.phone,
                branchId: userData.branchId,
                branch: userData.branch,
                branches: updatedBranches,
              }
            : u
        )
      );
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert("Сүлжээгээ шалгана уу");
    }
  };

  const deleteUser = async (id: number) => {
    const ok = window.confirm(
      "Та энэхүү ажилтныг идэвхгүй болгохдоо итгэлтэй байна уу?"
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        alert((data && data.error) || "Идэвхгүй болгох үед алдаа гарлаа");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      console.error(err);
      alert("Сүлжээгээ шалгана уу");
    }
  };

  const actionBtnCls =
    "inline-flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors";
  const tooltipCls =
    "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100";
  const editInputCls =
    "w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <main className="max-w-7xl px-4 lg:px-8 my-4 font-sans">
      <h1 className="text-2xl font-bold mt-1 mb-2">Бусад ажилтан</h1>
      <p className="text-gray-500 mb-4">
        Нягтлан, менежер, админ зэрэг бусад ажилчдыг бүртгэх, салбарт
        хуваарьлах, жагсаалтаар харах.
      </p>

      <UsersTabs />

      <OtherStaffForm
        branches={branches}
        onSuccess={(u) => {
          setUsers((prev) => [u, ...prev]);
        }}
      />

      {loading && <p className="text-gray-500 text-sm">Ачааллаж байна...</p>}
      {!loading && error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["#", "Овог", "Нэр", "И-мэйл", "РД", "Утас", "Үүрэг", "Салбар", "Үйлдэл"].map((label) => (
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
              {users.map((u, index) => {
                const isEditing = editingId === u.id;

                if (isEditing) {
                  return (
                    <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                      <td className="border-b border-gray-100 py-2 px-3">{index + 1}</td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        <input
                          name="ovog"
                          value={editForm.ovog}
                          onChange={handleEditChange}
                          className={editInputCls}
                        />
                      </td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        <input
                          name="name"
                          value={editForm.name}
                          onChange={handleEditChange}
                          className={editInputCls}
                        />
                      </td>
                      <td className="border-b border-gray-100 py-2 px-3">{u.email}</td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        <input
                          name="regNo"
                          value={editForm.regNo}
                          onChange={handleEditChange}
                          className={editInputCls}
                        />
                      </td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        <input
                          name="phone"
                          value={editForm.phone}
                          onChange={handleEditChange}
                          className={editInputCls}
                        />
                      </td>
                      <td className="border-b border-gray-100 py-2 px-3">{getRoleLabel(u.role)}</td>
                      <td className="border-b border-gray-100 py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {branches.map((b) => (
                            <label
                              key={b.id}
                              className="cursor-pointer select-none inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700"
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={editForm.editBranchIds.includes(b.id)}
                                onChange={() => handleEditBranchToggle(b.id)}
                              />
                              {b.name}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {/* Хадгалах */}
                          <div className="group relative inline-block">
                            <button
                              type="button"
                              onClick={() => saveEdit(u.id)}
                              aria-label="Хадгалах"
                              className={actionBtnCls}
                            >
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" />
                              </svg>
                            </button>
                            <span className={tooltipCls}>Хадгалах</span>
                          </div>
                          {/* Цуцлах */}
                          <div className="group relative inline-block">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              aria-label="Цуцлах"
                              className={actionBtnCls}
                            >
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <span className={tooltipCls}>Цуцлах</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={u.id} className="odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                    <td className="border-b border-gray-100 py-2 px-3">{index + 1}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{u.ovog || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{u.name || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{u.email}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{u.regNo || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{u.phone || "-"}</td>
                    <td className="border-b border-gray-100 py-2 px-3">{getRoleLabel(u.role)}</td>
                    <td className="border-b border-gray-100 py-2 px-3">
                      {Array.isArray(u.branches) && u.branches.length > 0
                        ? u.branches.map((b) => b.name).join(", ")
                        : u.branch
                        ? u.branch.name
                        : "-"}
                    </td>
                    <td className="border-b border-gray-100 py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {/* Засах */}
                        <div className="group relative inline-block">
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            aria-label="Засах"
                            className={actionBtnCls}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <span className={tooltipCls}>Засах</span>
                        </div>
                        {/* Идэвхгүй болгох */}
                        <div className="group relative inline-block">
                          <button
                            type="button"
                            onClick={() => deleteUser(u.id)}
                            aria-label="Идэвхгүй болгох"
                            className="inline-flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-gray-50 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <span className={tooltipCls}>Идэвхгүй болгох</span>
                        </div>
                        {/* Нууц үг сэргээх */}
                        <SendResetLinkButton userId={u.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-gray-400 py-6 text-sm">
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
