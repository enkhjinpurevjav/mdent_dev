import React, { useEffect, useState } from "react";
import { formatDoctorName } from "../../utils/format";

type EncounterReportModalProps = {
  open: boolean;
  onClose: () => void;
  appointmentId: number | null;
};

type EncounterDiagnosis = {
  id: number;
  encounterId: number;
  diagnosisId?: number | null;
  toothCode?: string | null;
  note?: string | null;
  createdAt: string;
  diagnosis?: {
    id: number;
    code: string;
    name: string;
  } | null;
  sterilizationIndicators?: Array<{
    indicator: {
      code: string;
    };
  }>;
};

type InvoiceItem = {
  id: number;
  itemType: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  teethNumbers?: string[] | null;
  service?: {
    name: string;
  } | null;
  product?: {
    name: string;
  } | null;
};

type Payment = {
  id: number;
  amount: number;
  method: string;
  timestamp: string;
};

type Invoice = {
  id: number;
  totalAmount: number;
  totalBeforeDiscount: number;
  discountPercent: string;
  collectionDiscountAmount: number;
  finalAmount: number;
  items: InvoiceItem[];
  payments: Payment[];
  eBarimtReceipt?: {
    receiptNumber: string;
    timestamp: string;
  } | null;
};

type PrescriptionItem = {
  id: number;
  order: number;
  drugName: string;
  durationDays: number;
  quantityPerTake: number;
  frequencyPerDay: number;
  note?: string | null;
};

type Prescription = {
  id: number;
  items: PrescriptionItem[];
};

type Media = {
  id: number;
  filePath: string;
  toothCode?: string | null;
  type: string;
};

type ReportData = {
  appointment: {
    id: number;
    scheduledAt: string;
    status: string;
  };
  patient: {
    id: number;
    name: string;
    ovog?: string | null;
    regNo?: string | null;
    birthDate?: string | null;
    gender?: string | null;
  };
  patientBook: {
    id: number;
    bookNumber: string;
  } | null;
  branch: {
    id: number;
    name: string;
  };
  doctor: {
    id: number;
    name?: string | null;
    ovog?: string | null;
    email?: string | null;
    signatureImagePath?: string | null;
  };
  encounter: {
    id: number;
    visitDate: string;
    notes?: string | null;
  };
  diagnoses: EncounterDiagnosis[];
  invoice: Invoice | null;
  prescription: Prescription | null;
  media: Media[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0 });
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    CASH: "Бэлэн",
    CARD: "Карт",
    TRANSFER: "Данс",
    QPAY: "QPay",
    INSURANCE: "Даатгал",
    VOUCHER: "Ваучер",
    BARTER: "Бартер",
    APPLICATION: "Апп",
    OTHER: "Бусад",
    WALLET: "Хэтэвч",
    EMPLOYEE_BENEFIT: "Ажилтны хөнгөлөлт",
  };
  return map[method] || method || "-";
}

function getDiscountLabel(discountPercent: string): string {
  const map: Record<string, string> = {
    ZERO: "0%",
    FIVE: "5%",
    TEN: "10%",
    FIFTEEN: "15%",
    TWENTY: "20%",
  };
  return map[discountPercent] || discountPercent;
}

function formatTeethNumbers(teethNumbers?: string[] | null): string {
  return teethNumbers && teethNumbers.length > 0
    ? teethNumbers.join(", ")
    : "-";
}

export default function EncounterReportModal({
  open,
  onClose,
  appointmentId,
}: EncounterReportModalProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !appointmentId) {
      setData(null);
      setError("");
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/appointments/${appointmentId}/report`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || "Failed to load report");
        }

        setData(json as ReportData);
      } catch (err) {
        console.error("Error loading encounter report:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load report"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, appointmentId]);

  if (!open) return null;

  // Modal backdrop
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-[1200px] max-h-[90vh] overflow-auto shadow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="m-0 text-lg font-semibold">
            Үзлэгийн тайлан
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-2xl cursor-pointer text-gray-500"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && (
            <div className="text-center py-10 text-gray-500">
              Уншиж байна...
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded">
              {error}
            </div>
          )}

          {data && !loading && (
            <div>
              {/* Patient Info Header */}
              <div className="mb-4 p-3 bg-gray-50 rounded text-[13px]">
                <div className="mb-1">
                  <strong>Өвчтөн:</strong>{" "}
                  {[data.patient.ovog, data.patient.name]
                    .filter(Boolean)
                    .join(" ")}
                  {data.patient.regNo && ` (РД: ${data.patient.regNo})`}
                  {data.patientBook && ` | Карт: ${data.patientBook.bookNumber}`}
                </div>
                <div className="mb-1">
                  <strong>Үзлэгийн огноо:</strong>{" "}
                  {formatDateTime(data.encounter.visitDate)}
                </div>
                <div className="mb-1">
                  <strong>Салбар:</strong> {data.branch.name}
                </div>
                <div>
                  <strong>Эмч:</strong>{" "}
                  {formatDoctorName(data.doctor)}
                </div>
              </div>

              {/* Diagnosis Table */}
              <section className="mb-6">
                <h3 className="text-sm mb-2 font-semibold">
                  Оношлогоо ба эмчилгээ
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-200 p-[6px] text-left">№</th>
                        <th className="border border-gray-200 p-[6px] text-left">Шүд</th>
                        <th className="border border-gray-200 p-[6px] text-left">Оношилгоо код</th>
                        <th className="border border-gray-200 p-[6px] text-left">Оношилгоо нэр</th>
                        <th className="border border-gray-200 p-[6px] text-left">Ариутгал</th>
                        <th className="border border-gray-200 p-[6px] text-left">Эмчилгээ</th>
                        <th className="border border-gray-200 p-[6px] text-left">Төлбөр</th>
                        <th className="border border-gray-200 p-[6px] text-left">
                          Бодит үзлэг, зөвлүүр
                        </th>
                        <th className="border border-gray-200 p-[6px] text-left">Тэмдэглэл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const serviceItems =
                          data.invoice?.items.filter(
                            (item) => item.itemType === "SERVICE"
                          ) || [];
                        const productItems =
                          data.invoice?.items.filter(
                            (item) => item.itemType === "PRODUCT"
                          ) || [];

                        const diagnosisRows = data.diagnoses.map((diag, idx) => {
                          const matchedService = serviceItems[idx] || null;

                          // Sterilization indicator codes
                          const indicatorCodes =
                            diag.sterilizationIndicators
                              ?.map((si) => si.indicator.code)
                              .join(", ") || "-";

                          return (
                            <tr key={`diag-${diag.id}`}>
                              <td className="border border-gray-200 p-[6px] text-left">{idx + 1}</td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {diag.toothCode || "-"}
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {diag.diagnosis?.code || "-"}
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {diag.diagnosis?.name || "-"}
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">{indicatorCodes}</td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {matchedService ? matchedService.name : "-"}
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {matchedService
                                  ? formatNumber(matchedService.lineTotal)
                                  : "0"}
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {diag.note || "-"}
                              </td>
                              {/* Per spec: "Тэмдэглэл" column remains blank (distinct from diagnosis note) */}
                              <td className="border border-gray-200 p-[6px] text-left">-</td>
                            </tr>
                          );
                        });

                        // Remaining SERVICE items not consumed by diagnosis rows
                        const extraServiceRows = serviceItems
                          .slice(data.diagnoses.length)
                          .map((item, i) => {
                            const rowNum = data.diagnoses.length + i + 1;
                            return (
                              <tr key={`svc-${item.id}`}>
                                <td className="border border-gray-200 p-[6px] text-left">{rowNum}</td>
                                <td className="border border-gray-200 p-[6px] text-left">{formatTeethNumbers(item.teethNumbers)}</td>
                                <td className="border border-gray-200 p-[6px] text-left">-</td>
                                <td className="border border-gray-200 p-[6px] text-left">-</td>
                                <td className="border border-gray-200 p-[6px] text-left">-</td>
                                <td className="border border-gray-200 p-[6px] text-left">{item.name}</td>
                                <td className="border border-gray-200 p-[6px] text-left">
                                  {formatNumber(item.lineTotal)}
                                </td>
                                <td className="border border-gray-200 p-[6px] text-left">-</td>
                                <td className="border border-gray-200 p-[6px] text-left">-</td>
                              </tr>
                            );
                          });

                        // ALL PRODUCT items appended after service rows
                        const baseProductRow =
                          data.diagnoses.length + extraServiceRows.length;
                        const extraProductRows = productItems.map((item, i) => (
                          <tr key={`prod-${item.id}`}>
                            <td className="border border-gray-200 p-[6px] text-left">{baseProductRow + i + 1}</td>
                            <td className="border border-gray-200 p-[6px] text-left">{formatTeethNumbers(item.teethNumbers)}</td>
                            <td className="border border-gray-200 p-[6px] text-left">-</td>
                            <td className="border border-gray-200 p-[6px] text-left">-</td>
                            <td className="border border-gray-200 p-[6px] text-left">-</td>
                            <td className="border border-gray-200 p-[6px] text-left">{item.name}</td>
                            <td className="border border-gray-200 p-[6px] text-left">
                              {formatNumber(item.lineTotal)}
                            </td>
                            <td className="border border-gray-200 p-[6px] text-left">-</td>
                            <td className="border border-gray-200 p-[6px] text-left">-</td>
                          </tr>
                        ));

                        const allRows = [
                          ...diagnosisRows,
                          ...extraServiceRows,
                          ...extraProductRows,
                        ];

                        if (allRows.length === 0) {
                          return (
                            <tr>
                              <td
                                colSpan={9}
                                className="border border-gray-200 p-[6px] text-center text-gray-500"
                              >
                                Оношилгоо бүртгээгүй байна.
                              </td>
                            </tr>
                          );
                        }

                        return allRows;
                      })()}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Totals Block */}
              {data.invoice && (
                <section className="mb-6">
                  <h3 className="text-sm mb-2 font-semibold">
                    Төлбөрийн мэдээлэл
                  </h3>
                  <div className="p-3 bg-gray-50 rounded text-[13px]">
                    <div className="mb-1">
                      <strong>Нийт дүн (хөнгөлөлт өгөхөөс өмнө):</strong>{" "}
                      {formatNumber(data.invoice.totalBeforeDiscount)} ₮
                    </div>
                    <div className="mb-1">
                      <strong>Хөнгөлөлт:</strong>{" "}
                      {getDiscountLabel(data.invoice.discountPercent)}
                      {data.invoice.collectionDiscountAmount > 0 &&
                        ` (${formatNumber(
                          data.invoice.collectionDiscountAmount
                        )} ₮)`}
                    </div>
                    <div className="mb-1">
                      <strong>Эцсийн дүн:</strong>{" "}
                      {formatNumber(data.invoice.finalAmount)} ₮
                    </div>
                    <div className="mb-1">
                      <strong>Төлсөн:</strong>{" "}
                      {formatNumber(
                        data.invoice.payments.reduce(
                          (sum, p) => sum + p.amount,
                          0
                        )
                      )}{" "}
                      ₮
                    </div>
                    <div>
                      <strong>Үлдэгдэл:</strong>{" "}
                      {formatNumber(
                        data.invoice.finalAmount -
                          data.invoice.payments.reduce(
                            (sum, p) => sum + p.amount,
                            0
                          )
                      )}{" "}
                      ₮
                    </div>
                  </div>

                  {/* Payments by method */}
                  {data.invoice.payments.length > 0 && (
                    <div className="mt-3">
                      <strong className="text-[13px] block mb-1">
                        Төлбөрийн дэлгэрэнгүй:
                      </strong>
                      <table className="w-full border-collapse text-xs border border-gray-200">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-200 p-[6px] text-left">Огноо</th>
                            <th className="border border-gray-200 p-[6px] text-left">Төлбөрийн хэрэгсэл</th>
                            <th className="border border-gray-200 p-[6px] text-left">Дүн</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.invoice.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {formatDateTime(payment.timestamp)}
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">{formatPaymentMethod(payment.method)}</td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {formatNumber(payment.amount)} ₮
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* E-Barimt Receipt */}
                  {data.invoice.eBarimtReceipt && (
                    <div className="mt-3 text-[13px]">
                      <strong>Э-Баримт:</strong> №
                      {data.invoice.eBarimtReceipt.receiptNumber} (
                      {formatDateTime(data.invoice.eBarimtReceipt.timestamp)})
                    </div>
                  )}
                </section>
              )}

              {/* Products Section */}
              {data.invoice &&
                data.invoice.items.filter((item) => item.itemType === "PRODUCT")
                  .length > 0 && (
                  <section className="mb-6">
                    <h3 className="text-sm mb-2 font-semibold">
                      Бүтээгдэхүүн
                    </h3>
                    <table className="w-full border-collapse text-xs border border-gray-200">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-200 p-[6px] text-left">№</th>
                          <th className="border border-gray-200 p-[6px] text-left">Нэр</th>
                          <th className="border border-gray-200 p-[6px] text-left">Нэгж үнэ</th>
                          <th className="border border-gray-200 p-[6px] text-left">Тоо ширхэг</th>
                          <th className="border border-gray-200 p-[6px] text-left">Нийт</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoice.items
                          .filter((item) => item.itemType === "PRODUCT")
                          .map((item, idx) => (
                            <tr key={item.id}>
                              <td className="border border-gray-200 p-[6px] text-left">{idx + 1}</td>
                              <td className="border border-gray-200 p-[6px] text-left">{item.name}</td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {formatNumber(item.unitPrice)} ₮
                              </td>
                              <td className="border border-gray-200 p-[6px] text-left">{item.quantity}</td>
                              <td className="border border-gray-200 p-[6px] text-left">
                                {formatNumber(item.lineTotal)} ₮
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </section>
                )}

              {/* Prescription Section */}
              {data.prescription && data.prescription.items.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-sm mb-2 font-semibold">
                    Жор
                  </h3>
                  <table className="w-full border-collapse text-xs border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-200 p-[6px] text-left">№</th>
                        <th className="border border-gray-200 p-[6px] text-left">Эмийн нэр</th>
                        <th className="border border-gray-200 p-[6px] text-left">Хугацаа (өдөр)</th>
                        <th className="border border-gray-200 p-[6px] text-left">Нэг удаагийн тоо</th>
                        <th className="border border-gray-200 p-[6px] text-left">Өдөрт</th>
                        <th className="border border-gray-200 p-[6px] text-left">Тэмдэглэл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.prescription.items.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="border border-gray-200 p-[6px] text-left">{idx + 1}</td>
                          <td className="border border-gray-200 p-[6px] text-left">{item.drugName}</td>
                          <td className="border border-gray-200 p-[6px] text-left">{item.durationDays}</td>
                          <td className="border border-gray-200 p-[6px] text-left">
                            {item.quantityPerTake}
                          </td>
                          <td className="border border-gray-200 p-[6px] text-left">
                            {item.frequencyPerDay}
                          </td>
                          <td className="border border-gray-200 p-[6px] text-left">{item.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* Media Section */}
              {data.media.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-sm mb-2 font-semibold">
                    Зураг / Файл
                  </h3>
                  <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
                    {data.media.map((m) => {
                      const t = (m.type || "").toLowerCase();
                      const isImage =
                        t === "photo" ||
                        t === "xray" ||
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(m.filePath);

                      return (
                        <div
                          key={m.id}
                          className="border border-gray-200 rounded p-1 text-center"
                        >
                          {isImage ? (
                            <a
                              href={m.filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={m.filePath}
                                alt={`Media ${m.id}`}
                                className="w-full h-[100px] object-cover rounded"
                              />
                            </a>
                          ) : (
                            <a
                              href={m.filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block p-3 text-blue-500 text-xs"
                            >
                              Файл үзэх
                            </a>
                          )}
                          <div className="text-[11px] text-gray-500 mt-1">
                            {t === "xray" && "(X-ray) "}
                            {m.toothCode && `Шүд: ${m.toothCode}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Doctor Signature Block */}
              <section className="mt-6">
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-[13px] mb-2">
                    <strong>Эмч:</strong>{" "}
                    {formatDoctorName(data.doctor)}
                  </div>
                  {data.doctor.signatureImagePath && (
                    <div>
                      <img
                        src={data.doctor.signatureImagePath}
                        alt="Doctor signature"
                        className="max-w-[200px] max-h-[80px] border border-gray-200 rounded"
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
