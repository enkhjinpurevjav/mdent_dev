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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 8,
          maxWidth: 1200,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Үзлэгийн тайлан
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 16 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
              Уншиж байна...
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 16,
                background: "#fee",
                color: "#c00",
                borderRadius: 4,
              }}
            >
              {error}
            </div>
          )}

          {data && !loading && (
            <div>
              {/* Patient Info Header */}
              <div
                style={{
                  marginBottom: 16,
                  padding: 12,
                  background: "#f9fafb",
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong>Өвчтөн:</strong>{" "}
                  {[data.patient.ovog, data.patient.name]
                    .filter(Boolean)
                    .join(" ")}
                  {data.patient.regNo && ` (РД: ${data.patient.regNo})`}
                  {data.patientBook && ` | Карт: ${data.patientBook.bookNumber}`}
                </div>
                <div style={{ marginBottom: 4 }}>
                  <strong>Үзлэгийн огноо:</strong>{" "}
                  {formatDateTime(data.encounter.visitDate)}
                </div>
                <div style={{ marginBottom: 4 }}>
                  <strong>Салбар:</strong> {data.branch.name}
                </div>
                <div>
                  <strong>Эмч:</strong>{" "}
                  {formatDoctorName(data.doctor)}
                </div>
              </div>

              {/* Diagnosis Table */}
              <section style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}>
                  Оношлогоо ба эмчилгээ
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        <th style={tableCellStyle}>№</th>
                        <th style={tableCellStyle}>Шүд</th>
                        <th style={tableCellStyle}>Оношилгоо код</th>
                        <th style={tableCellStyle}>Оношилгоо нэр</th>
                        <th style={tableCellStyle}>Ариутгал</th>
                        <th style={tableCellStyle}>Эмчилгээ</th>
                        <th style={tableCellStyle}>Төлбөр</th>
                        <th style={tableCellStyle}>
                          Бодит үзлэг, зөвлүүр
                        </th>
                        <th style={tableCellStyle}>Тэмдэглэл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.diagnoses.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              ...tableCellStyle,
                              textAlign: "center",
                              color: "#6b7280",
                            }}
                          >
                            Оношилгоо бүртгээгүй байна.
                          </td>
                        </tr>
                      ) : (
                        data.diagnoses.map((diag, idx) => {
                          // Strategy 2: Sequential mapping between diagnosis rows (createdAt asc) 
                          // and SERVICE items (id asc) as confirmed in the spec.
                          // This approach assumes the items were added in the same order as diagnoses.
                          const serviceItems =
                            data.invoice?.items.filter(
                              (item) => item.itemType === "SERVICE"
                            ) || [];
                          const matchedService = serviceItems[idx] || null;

                          // Sterilization indicator codes
                          const indicatorCodes =
                            diag.sterilizationIndicators
                              ?.map((si) => si.indicator.code)
                              .join(", ") || "-";

                          return (
                            <tr key={diag.id}>
                              <td style={tableCellStyle}>{idx + 1}</td>
                              <td style={tableCellStyle}>
                                {diag.toothCode || "-"}
                              </td>
                              <td style={tableCellStyle}>
                                {diag.diagnosis?.code || "-"}
                              </td>
                              <td style={tableCellStyle}>
                                {diag.diagnosis?.name || "-"}
                              </td>
                              <td style={tableCellStyle}>{indicatorCodes}</td>
                              <td style={tableCellStyle}>
                                {matchedService
                                  ? matchedService.name
                                  : "-"}
                              </td>
                              <td style={tableCellStyle}>
                                {matchedService
                                  ? formatNumber(matchedService.lineTotal)
                                  : "0"}
                              </td>
                              <td style={tableCellStyle}>
                                {diag.note || "-"}
                              </td>
                              {/* Per spec: "Тэмдэглэл" column remains blank (distinct from diagnosis note) */}
                              <td style={tableCellStyle}>-</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Totals Block */}
              {data.invoice && (
                <section style={{ marginBottom: 24 }}>
                  <h3
                    style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}
                  >
                    Төлбөрийн мэдээлэл
                  </h3>
                  <div
                    style={{
                      padding: 12,
                      background: "#f9fafb",
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ marginBottom: 4 }}>
                      <strong>Нийт дүн (хөнгөлөлт өгөхөөс өмнө):</strong>{" "}
                      {formatNumber(data.invoice.totalBeforeDiscount)} ₮
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      <strong>Хөнгөлөлт:</strong>{" "}
                      {getDiscountLabel(data.invoice.discountPercent)}
                      {data.invoice.collectionDiscountAmount > 0 &&
                        ` (${formatNumber(
                          data.invoice.collectionDiscountAmount
                        )} ₮)`}
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      <strong>Эцсийн дүн:</strong>{" "}
                      {formatNumber(data.invoice.finalAmount)} ₮
                    </div>
                    <div style={{ marginBottom: 4 }}>
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
                    <div style={{ marginTop: 12 }}>
                      <strong
                        style={{ fontSize: 13, display: "block", marginBottom: 4 }}
                      >
                        Төлбөрийн дэлгэрэнгүй:
                      </strong>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#f3f4f6" }}>
                            <th style={tableCellStyle}>Огноо</th>
                            <th style={tableCellStyle}>Төлбөрийн хэрэгсэл</th>
                            <th style={tableCellStyle}>Дүн</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.invoice.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td style={tableCellStyle}>
                                {formatDateTime(payment.timestamp)}
                              </td>
                              <td style={tableCellStyle}>{formatPaymentMethod(payment.method)}</td>
                              <td style={tableCellStyle}>
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
                    <div style={{ marginTop: 12, fontSize: 13 }}>
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
                  <section style={{ marginBottom: 24 }}>
                    <h3
                      style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}
                    >
                      Бүтээгдэхүүн
                    </h3>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f3f4f6" }}>
                          <th style={tableCellStyle}>№</th>
                          <th style={tableCellStyle}>Нэр</th>
                          <th style={tableCellStyle}>Нэгж үнэ</th>
                          <th style={tableCellStyle}>Тоо ширхэг</th>
                          <th style={tableCellStyle}>Нийт</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoice.items
                          .filter((item) => item.itemType === "PRODUCT")
                          .map((item, idx) => (
                            <tr key={item.id}>
                              <td style={tableCellStyle}>{idx + 1}</td>
                              <td style={tableCellStyle}>{item.name}</td>
                              <td style={tableCellStyle}>
                                {formatNumber(item.unitPrice)} ₮
                              </td>
                              <td style={tableCellStyle}>{item.quantity}</td>
                              <td style={tableCellStyle}>
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
                <section style={{ marginBottom: 24 }}>
                  <h3
                    style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}
                  >
                    Жор
                  </h3>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        <th style={tableCellStyle}>№</th>
                        <th style={tableCellStyle}>Эмийн нэр</th>
                        <th style={tableCellStyle}>Хугацаа (өдөр)</th>
                        <th style={tableCellStyle}>Нэг удаагийн тоо</th>
                        <th style={tableCellStyle}>Өдөрт</th>
                        <th style={tableCellStyle}>Тэмдэглэл</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.prescription.items.map((item, idx) => (
                        <tr key={item.id}>
                          <td style={tableCellStyle}>{idx + 1}</td>
                          <td style={tableCellStyle}>{item.drugName}</td>
                          <td style={tableCellStyle}>{item.durationDays}</td>
                          <td style={tableCellStyle}>
                            {item.quantityPerTake}
                          </td>
                          <td style={tableCellStyle}>
                            {item.frequencyPerDay}
                          </td>
                          <td style={tableCellStyle}>{item.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* Media Section */}
              {data.media.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <h3
                    style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}
                  >
                    Зураг / Файл
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {data.media.map((m) => {
                      const isImage =
                        m.type === "photo" ||
                        m.type === "xray" ||
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(m.filePath);

                      return (
                        <div
                          key={m.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 4,
                            padding: 4,
                            textAlign: "center",
                          }}
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
                                style={{
                                  width: "100%",
                                  height: 100,
                                  objectFit: "cover",
                                  borderRadius: 4,
                                }}
                              />
                            </a>
                          ) : (
                            <a
                              href={m.filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "block",
                                padding: 12,
                                color: "#3b82f6",
                                fontSize: 12,
                              }}
                            >
                              Файл үзэх
                            </a>
                          )}
                          <div
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              marginTop: 4,
                            }}
                          >
                            {m.type === "xray" && "(X-ray) "}
                            {m.toothCode && `Шүд: ${m.toothCode}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Doctor Signature Block */}
              <section style={{ marginTop: 24 }}>
                <div
                  style={{
                    padding: 12,
                    background: "#f9fafb",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>Эмч:</strong>{" "}
                    {formatDoctorName(data.doctor)}
                  </div>
                  {data.doctor.signatureImagePath && (
                    <div>
                      <img
                        src={data.doctor.signatureImagePath}
                        alt="Doctor signature"
                        style={{
                          maxWidth: 200,
                          maxHeight: 80,
                          border: "1px solid #e5e7eb",
                          borderRadius: 4,
                        }}
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

const tableCellStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 6,
  textAlign: "left",
};
