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
  { value: "sterilization", label: "Стерилизация" },
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
      return "Стерилизация";
    case "other":
      return "Бусад";
    case "receptionist":
      return "Ресепшн";
    case "nurse":
      return "Сувилагч";
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

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <h2>Шинэ ажилтан бүртгэх</h2>

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
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          className="min-h-[32px]"
          required
        >
          <option value="">Үүрэг сонгох</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
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
      "Та энэхүү ажилтныг устгахдаа итгэлтэй байна уу?"
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
        alert((data && data.error) || "Устгах үед алдаа гарлаа");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      console.error(err);
      alert("Сүлжээгээ шалгана уу");
    }
  };

  return (
    <main className="max-w-[900px] mx-auto my-10 p-6 font-sans">
      <h1>Бусад ажилтан</h1>
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

      {loading && <div>Ачааллаж байна...</div>}
      {!loading && error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <table className="w-full border-collapse mt-2 text-sm">
          <thead>
            <tr>
              {/* # constant number column */}
              <th className="text-left border-b border-gray-200 p-2">#</th>
              <th className="text-left border-b border-gray-200 p-2">Овог</th>
              <th className="text-left border-b border-gray-200 p-2">Нэр</th>
              <th className="text-left border-b border-gray-200 p-2">И-мэйл</th>
              <th className="text-left border-b border-gray-200 p-2">РД</th>
              <th className="text-left border-b border-gray-200 p-2">Утас</th>
              {/* New: Үүрэг column between Утас and Салбар */}
              <th className="text-left border-b border-gray-200 p-2">Үүрэг</th>
              <th className="text-left border-b border-gray-200 p-2">Салбар</th>
              <th className="text-left border-b border-gray-200 p-2">Үйлдэл</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, index) => {
              const isEditing = editingId === u.id;

              if (isEditing) {
                return (
                  <tr key={u.id}>
                    {/* # */}
                    <td className="border-b border-gray-100 p-2">{index + 1}</td>
                    <td className="border-b border-gray-100 p-2">
                      <input
                        name="ovog"
                        value={editForm.ovog}
                        onChange={handleEditChange}
                        className="w-full"
                      />
                    </td>
                    <td className="border-b border-gray-100 p-2">
                      <input
                        name="name"
                        value={editForm.name}
                        onChange={handleEditChange}
                        className="w-full"
                      />
                    </td>
                    <td className="border-b border-gray-100 p-2">{u.email}</td>
                    <td className="border-b border-gray-100 p-2">
                      <input
                        name="regNo"
                        value={editForm.regNo}
                        onChange={handleEditChange}
                        className="w-full"
                      />
                    </td>
                    <td className="border-b border-gray-100 p-2">
                      <input
                        name="phone"
                        value={editForm.phone}
                        onChange={handleEditChange}
                        className="w-full"
                      />
                    </td>
                    {/* Үүрэг: not editable here, shown as label */}
                    <td className="border-b border-gray-100 p-2">{getRoleLabel(u.role)}</td>
                    <td className="border-b border-gray-100 p-2">
                      <div className="flex flex-wrap gap-1">
                        {branches.map((b) => (
                          <label
                            key={b.id}
                            className="inline-flex items-center gap-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={editForm.editBranchIds.includes(b.id)}
                              onChange={() => handleEditBranchToggle(b.id)}
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="border-b border-gray-100 p-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => saveEdit(u.id)}
                        className="mr-2 px-1.5 py-0.5 text-xs"
                      >
                        Хадгалах
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-1.5 py-0.5 text-xs"
                      >
                        Цуцлах
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={u.id}>
                  {/* # */}
                  <td className="border-b border-gray-100 p-2">{index + 1}</td>
                  <td className="border-b border-gray-100 p-2">{u.ovog || "-"}</td>
                  <td className="border-b border-gray-100 p-2">{u.name || "-"}</td>
                  <td className="border-b border-gray-100 p-2">{u.email}</td>
                  <td className="border-b border-gray-100 p-2">{u.regNo || "-"}</td>
                  <td className="border-b border-gray-100 p-2">{u.phone || "-"}</td>
                  <td className="border-b border-gray-100 p-2">{getRoleLabel(u.role)}</td>
                  <td className="border-b border-gray-100 p-2">
                    {Array.isArray(u.branches) && u.branches.length > 0
                      ? u.branches.map((b) => b.name).join(", ")
                      : u.branch
                      ? u.branch.name
                      : "-"}
                  </td>
                  <td className="border-b border-gray-100 p-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(u)}
                      className="mr-2 px-1.5 py-0.5 text-xs"
                    >
                      Засах
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteUser(u.id)}
                      className="px-1.5 py-0.5 text-xs text-red-700 border-red-700"
                    >
                      Устгах
                    </button>
                    {/* Нууц үг сэргээх */}
                    <SendResetLinkButton email={u.email} className="ml-1" />
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 p-3">
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
