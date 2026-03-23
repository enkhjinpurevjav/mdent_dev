import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import EncounterReportModal from "../../components/patients/EncounterReportModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type Branch = { id: number; name: string };

type PatientBalanceItem = {
  patientId: number;
  bookNumber: string | null;
  name: string;
  ovog: string | null;
  regNo: string | null;
  phone: string | null;
  branchId: number;
  branchName: string | null;
  totalBilled: number;
  totalPaid: number;
  totalAdjusted: number;
  balance: number;
};

type BalanceListResponse = {
  total: number;
  page: number;
  pageSize: number;
  items: PatientBalanceItem[];
};

type InvoiceBreakdownItem = {
  invoiceId: number;
  appointmentId: number | null;
  scheduledAt: string | null;
  doctorName: string | null;
  billed: number;
  paid: number;
  remaining: number;
  status: string;
  createdAt: string;
};

type AdjustmentLogItem = {
  id: number;
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: { name: string | null; ovog: string | null } | null;
};

type BalanceDetailResponse = {
  invoiceBreakdown: InvoiceBreakdownItem[];
  adjustmentLog: AdjustmentLogItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMnt(v: number) {
  return `${Math.abs(Number(v || 0)).toLocaleString("mn-MN")} ₮`;
}

function fmtName(ovog: string | null | undefined, name: string | null | undefined) {
  const n = (name || "").trim();
  const o = (ovog || "").trim();
  if (o && n) return `${o[0]}. ${n}`;
  return n || o || "-";
}

function fmtDatetime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("mn-MN");
}

// ── Breakdown Modal ───────────────────────────────────────────────────────────

function BalanceDetailModal({
  open,
  onClose,
  patientId,
  patientName,
  onOpenReport,
}: {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  patientName: string;
  onOpenReport: (appointmentId: number) => void;
}) {
  const [data, setData] = useState<BalanceDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !patientId) {
      setData(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    fetch(`/api/reports/patient-balance-detail/${patientId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json as BalanceDetailResponse);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Мэдээлэл татахад алдаа гарлаа")
      )
      .finally(() => setLoading(false));
  }, [open, patientId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-auto shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="m-0 text-base font-semibold">
            Үзлэгийн задаргаа — {patientName}
          </h2>
          <button onClick={onClose} className="text-gray-500 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-4">
          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">Ачаалж байна...</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && data && (
            <>
              <h3 className="text-sm font-semibold mb-2">Нэхэмжлэлүүд</h3>
              {data.invoiceBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500 mb-4">Нэхэмжлэл байхгүй.</p>
              ) : (
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-xs border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 p-2 text-left">Огноо</th>
                        <th className="border border-gray-200 p-2 text-left">Эмч</th>
                        <th className="border border-gray-200 p-2 text-right">Нэхэмжилсэн</th>
                        <th className="border border-gray-200 p-2 text-right">Төлсөн</th>
                        <th className="border border-gray-200 p-2 text-right">Үлдэгдэл</th>
                        <th className="border border-gray-200 p-2 text-center">Тайлан</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoiceBreakdown.map((row) => (
                        <tr key={row.invoiceId} className="hover:bg-gray-50">
                          <td className="border border-gray-200 p-2">
                            {fmtDatetime(row.scheduledAt || row.createdAt)}
                          </td>
                          <td className="border border-gray-200 p-2">{row.doctorName || "-"}</td>
                          <td className="border border-gray-200 p-2 text-right">
                            {fmtMnt(row.billed)}
                          </td>
                          <td className="border border-gray-200 p-2 text-right">
                            {fmtMnt(row.paid)}
                          </td>
                          <td
                            className={`border border-gray-200 p-2 text-right font-medium ${
                              row.remaining > 0 ? "text-red-600" : row.remaining < 0 ? "text-green-600" : ""
                            }`}
                          >
                            {fmtMnt(row.remaining)}
                          </td>
                          <td className="border border-gray-200 p-2 text-center">
                            {row.appointmentId ? (
                              <button
                                onClick={() => onOpenReport(row.appointmentId!)}
                                className="text-blue-600 hover:underline text-xs"
                              >
                                Харах
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.adjustmentLog.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold mb-2">Гар засварын бүртгэл</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 p-2 text-left">Огноо</th>
                          <th className="border border-gray-200 p-2 text-right">Дүн</th>
                          <th className="border border-gray-200 p-2 text-left">Шалтгаан</th>
                          <th className="border border-gray-200 p-2 text-left">Хийсэн</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.adjustmentLog.map((adj) => (
                          <tr key={adj.id} className="hover:bg-gray-50">
                            <td className="border border-gray-200 p-2">
                              {fmtDatetime(adj.createdAt)}
                            </td>
                            <td
                              className={`border border-gray-200 p-2 text-right font-medium ${
                                adj.amount > 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {adj.amount > 0 ? "+" : ""}
                              {fmtMnt(adj.amount)}
                            </td>
                            <td className="border border-gray-200 p-2">{adj.reason}</td>
                            <td className="border border-gray-200 p-2">
                              {fmtName(adj.createdBy?.ovog, adj.createdBy?.name)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Balance Modal ────────────────────────────────────────────────────────

function EditBalanceModal({
  open,
  onClose,
  patientId,
  patientName,
  currentBalance,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  patientName: string;
  currentBalance: number;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      setError("Дүн оруулна уу (0-ээс ялгаатай тоо).");
      return;
    }
    if (!reason.trim()) {
      setError("Шалтгаан оруулна уу.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/reports/patient-balance-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId, amount: numAmount, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Хадгалахад алдаа гарлаа.");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Хадгалахад алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-md shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="m-0 text-base font-semibold">
            Үлдэгдэл засварлах — {patientName}
          </h2>
          <button onClick={onClose} className="text-gray-500 text-2xl leading-none">
            ×
          </button>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
            Одоогийн үлдэгдэл:{" "}
            <span className="font-semibold text-red-600">{fmtMnt(currentBalance)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Засварын дүн (₮)
            </label>
            <p className="text-xs text-gray-500 mb-1">
              Эерэг тоо = үйлчлүүлэгчийн данснд кредит нэмнэ (өр буурна). Сөрөг тоо = дебит (өр нэмнэ).
            </p>
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="жишээ: 50000 эсвэл -10000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Шалтгаан / тайлбар
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Шалтгааныг дэлгэрэнгүй бичнэ үү"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Болих
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Хадгалж байна..." : "Хадгалах"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function DebtsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [data, setData] = useState<BalanceListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null);
  const [detailPatientName, setDetailPatientName] = useState("");

  // Encounter report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportAppointmentId, setReportAppointmentId] = useState<number | null>(null);

  // Edit balance modal
  const [editOpen, setEditOpen] = useState(false);
  const [editPatientId, setEditPatientId] = useState<number | null>(null);
  const [editPatientName, setEditPatientName] = useState("");
  const [editCurrentBalance, setEditCurrentBalance] = useState(0);

  const canEdit =
    me?.role === "admin" || me?.role === "super_admin" || me?.role === "accountant";

  // Redirect if not authorized
  useEffect(() => {
    if (!authLoading && me && !canEdit && me.role !== "manager") {
      void router.replace("/");
    }
  }, [authLoading, me, canEdit, router]);

  // Load branches
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((d) => setBranches(Array.isArray(d) ? d : []))
      .catch(() => setBranches([]));
  }, []);

  const fetchData = useCallback(
    async (pg: number, brId: number | null, q: string) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ type: "debt", page: String(pg), pageSize: String(PAGE_SIZE) });
        if (brId) params.set("branchId", String(brId));
        if (q) params.set("search", q);
        const res = await fetch(`/api/reports/patient-balances?${params}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Мэдээлэл татахад алдаа гарлаа");
        setData(json as BalanceListResponse);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Мэдээлэл татахад алдаа гарлаа");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!authLoading && me) {
      void fetchData(page, branchId, search);
    }
  }, [authLoading, me, page, branchId, search, fetchData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setBranchId(Number(e.target.value) || null);
    setPage(1);
  };

  const openDetail = (item: PatientBalanceItem) => {
    setDetailPatientId(item.patientId);
    setDetailPatientName(fmtName(item.ovog, item.name));
    setDetailOpen(true);
  };

  const openEdit = (item: PatientBalanceItem) => {
    setEditPatientId(item.patientId);
    setEditPatientName(fmtName(item.ovog, item.name));
    setEditCurrentBalance(item.balance);
    setEditOpen(true);
  };

  const openReport = (appointmentId: number) => {
    setReportAppointmentId(appointmentId);
    setReportOpen(true);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-500">
        Ачаалж байна...
      </div>
    );
  }

  return (
    <div className="p-6 font-sans">
      <div className="mb-5">
        <h1 className="text-2xl font-bold mb-1">Авлага</h1>
        <p className="text-sm text-gray-500">Өрийн үлдэгдэлтэй үйлчлүүлэгчдийн жагсаалт</p>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Салбар</label>
          <select
            value={branchId ?? ""}
            onChange={handleBranchChange}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Бүх салбар</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Хайлт</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Нэр, РД, утас, картын дугаар..."
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="self-end rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Хайх
          </button>
        </form>
      </div>

      {/* Summary */}
      {data && (
        <div className="mb-4 text-sm text-gray-600">
          Нийт: <strong className="text-red-600">{data.total}</strong> үйлчлүүлэгч
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          Ачаалж байна...
        </div>
      )}

      {/* Table */}
      {!loading && data && (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                    Картын №
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                    Нэр
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                    РД
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                    Утас
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                    Салбар
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200 text-right">
                    Авлага (₮)
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-700 border-b border-gray-200 text-center">
                    Үйлдэл
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">
                      Авлагатай үйлчлүүлэгч олдсонгүй.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr key={item.patientId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {item.bookNumber ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/patients/${item.bookNumber ?? item.patientId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {fmtName(item.ovog, item.name)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.regNo || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.phone || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.branchName || "-"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">
                        {fmtMnt(item.balance)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => openDetail(item)}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Дэлгэрэнгүй
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => openEdit(item)}
                              className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              Засах
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 justify-end">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                ← Өмнөх
              </button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                Дараах →
              </button>
            </div>
          )}
        </>
      )}

      {/* Balance Detail Modal */}
      <BalanceDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        patientId={detailPatientId}
        patientName={detailPatientName}
        onOpenReport={openReport}
      />

      {/* Encounter Report Modal */}
      <EncounterReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        appointmentId={reportAppointmentId}
      />

      {/* Edit Balance Modal */}
      <EditBalanceModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        patientId={editPatientId}
        patientName={editPatientName}
        currentBalance={editCurrentBalance}
        onSaved={() => void fetchData(page, branchId, search)}
      />
    </div>
  );
}
