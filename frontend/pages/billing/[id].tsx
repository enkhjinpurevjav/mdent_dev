import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { QRCodeSVG } from "qrcode.react";
import { printImage } from "../../utils/printImage";

type Branch = { id: number; name: string };

type AppPaymentRow = { providerId?: number | null; amount: string };

type Patient = {
  id: number;
  ovog?: string | null;
  name: string;
  regNo?: string | null;
  phone?: string | null;
  branch?: Branch | null;
};

type PatientBook = { id: number; bookNumber: string; patient: Patient };

type Doctor = { id: number; name?: string | null; ovog?: string | null; email: string };

type Service = { id: number; code?: string | null; name: string; price: number; category?: string | null };

// ✅ NEW
type Product = { id: number; name: string; price: number; sku?: string | null };

type InvoiceItem = {
  id?: number;
  itemType: "SERVICE" | "PRODUCT";
  serviceId?: number | null;
  productId?: number | null;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal?: number;
  teethNumbers?: string[];
  source?: "ENCOUNTER" | "MANUAL";
  alreadyAllocated?: number;
  serviceCategory?: string | null;
  meta?: { assignedTo?: "DOCTOR" | "NURSE"; nurseId?: number | null } | null;
};

type AuditUser = { id: number; name: string | null; ovog: string | null };
type Payment = { id: number; amount: number; method: string; timestamp: string; createdByUser?: AuditUser | null };

type InvoiceResponse = {
  id: number | null;
  branchId: number;
  encounterId: number;
  patientId: number;
  status: string;
  totalBeforeDiscount: number;
  discountPercent: number;
  finalAmount: number;
  hasEBarimt: boolean;
  isProvisional?: boolean;
  items: InvoiceItem[];
  paidTotal?: number;
  unpaidAmount?: number;
  payments?: Payment[];
  patientTotalBilled?: number;
  patientTotalPaid?: number;
  patientBalance?: number;
  hasMarker?: boolean;
  patientOldBalance?: number;
  patientOvog?: string | null;
  patientName?: string | null;
  patientRegNo?: string | null;
  buyerType?: "B2C" | "B2B";
  buyerTin?: string | null;
  ebarimtReceipt?: {
    id?: number | null;
    status: string;
    ddtd: string | null;
    printedAtText: string | null;
    printedAt: string | null;
    totalAmount: number | null;
    qrData?: string | null;
    lottery?: string | null;
  } | null;
};

type EncounterService = {
  id: number;
  serviceId: number;
  quantity: number;
  price: number;
  meta?: {
    toothScope?: string;
    assignedTo?: string;
    diagnosisId?: number;
  } | null;
  service?: {
    id: number;
    name: string;
    code?: string;
    price: number;
  };
};

type EncounterDiagnosisRow = {
  id?: number;
  diagnosisId?: number | null;
  toothCode?: string | null;
};

type Encounter = {
  id: number;
  visitDate: string;
  notes?: string | null;
  patientBook: PatientBook;
  doctor: Doctor | null;
  prescription?: Prescription | null;
  encounterServices?: EncounterService[];
  encounterDiagnoses?: EncounterDiagnosisRow[];
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

type Prescription = { id: number; encounterId: number; items: PrescriptionItem[] };

type EncounterMedia = {
  id: number;
  encounterId: number;
  filePath: string;
  toothCode?: string | null;
  type: string;
};

type EncounterConsent = {
  encounterId: number;
  type: string;
  answers: any;
  patientSignedAt?: string | null;
  doctorSignedAt?: string | null;
  patientSignaturePath?: string | null;
  doctorSignaturePath?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ReceiptForDisplay = {
  id?: string | null;
  date?: string | null;
  lottery?: string | null;
  totalAmount?: number | null;
  qrData?: string | null;
};

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

function formatPatientName(p: Patient) {
  const ovog = p.ovog ? p.ovog.trim() : "";
  const name = p.name ? p.name.toString().trim() : "";
  if (!ovog) return name || p.regNo || String(p.id);
  const initial = ovog.charAt(0);
  return `${initial}. ${name}`;
}

function formatDoctorName(d: Doctor | null) {
  if (!d) return "-";
  const name = d.name?.trim();
  if (name) return name;
  return d.email;
}

function formatAuditUserDisplay(u: AuditUser | null | undefined): string {
  if (!u) return "-";
  const ovog = (u.ovog || "").trim();
  const name = (u.name || "").trim();
  if (ovog && name) return `${ovog} ${name}`;
  return name || ovog || "-";
}

function formatMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "0";
  return new Intl.NumberFormat("mn-MN").format(Number(v));
}

const CONSENT_TYPE_LABELS: Record<string, string> = {
  root_canal: "Сувгийн эмчилгээ",
  surgery: "Мэс засал",
  orthodontic: "Гажиг засал",
  prosthodontic: "Согог засал",
};

function formatConsentTypeLabel(type: string): string {
  return CONSENT_TYPE_LABELS[type] ?? type;
}

// ----------------- Payment section -----------------

// Rounding tolerance (₮) when validating split allocation totals
const PAYMENT_ALLOCATION_TOLERANCE = 1;

/** Returns true if an API error response indicates a sterilization mismatch */
function isSterilizationError(data: any): boolean {
  return (
    data?.errorCode === "UNRESOLVED_STERILIZATION_MISMATCH" ||
    data?.error?.includes("UNRESOLVED_STERILIZATION_MISMATCH") ||
    data?.error?.includes("mismatch") ||
    data?.error?.includes("sterilization")
  );
}

// Dynamic payment settings types
type PaymentProvider = {
  id: number;
  name: string;
  note?: string | null;
};

type PaymentMethodConfig = {
  key: string;
  label: string;
  providers?: PaymentProvider[];
};

function BillingPaymentSection({
  invoice,
  onUpdated,
}: {
  invoice: InvoiceResponse;
  onUpdated: (inv: InvoiceResponse) => void;
}) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [transferNote, setTransferNote] = useState("");
  const [insuranceProviderId, setInsuranceProviderId] = useState<number | null>(null);
  const [otherNote, setOtherNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [voucherCode, setVoucherCode] = useState("");
  const [barterCode, setBarterCode] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeRemaining, setEmployeeRemaining] = useState<number | null>(null);

  const [appRows, setAppRows] = useState<AppPaymentRow[]>([{ providerId: null, amount: "" }]);

  const [voucherType, setVoucherType] = useState<"MARKETING" | "GIFT" | "">("");
  const [voucherMaxAmount, setVoucherMaxAmount] = useState<number | null>(null);

  // Sterilization mismatch state
  const [unresolvedMismatches, setUnresolvedMismatches] = useState<any[]>([]);
  const [loadingMismatches, setLoadingMismatches] = useState(false);

  // QPay state
  const [qpayModalOpen, setQpayModalOpen] = useState(false);
  const [qpayInvoiceId, setQpayInvoiceId] = useState<string | null>(null);
  const [qpayQrImage, setQpayQrImage] = useState<string | null>(null);
  const [qpayQrText, setQpayQrText] = useState<string | null>(null);
  const [qpayUrls, setQpayUrls] = useState<string[]>([]);
  const [qpayGenerating, setQpayGenerating] = useState(false);
  const [qpayPolling, setQpayPolling] = useState(false);
  const [qpayError, setQpayError] = useState("");

  // Split payment state (only active when marker service is present)
  const [closeOldBalance, setCloseOldBalance] = useState(false);
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitAllocations, setSplitAllocations] = useState<Record<number, string>>({});
  const [qpayPaidAmount, setQpayPaidAmount] = useState<number | null>(null);



  // Load payment settings from backend
  useEffect(() => {
    const loadPaymentSettings = async () => {
      setLoadingMethods(true);
      try {
        const res = await fetch("/api/payment-settings");
        const data = await res.json();
        if (res.ok && data.methods) {
          setPaymentMethods(data.methods);
        }
      } catch (err) {
        console.error("Failed to load payment settings:", err);
      } finally {
        setLoadingMethods(false);
      }
    };

    void loadPaymentSettings();
  }, []);

  // Load sterilization mismatches for this encounter
  useEffect(() => {
    if (!invoice.encounterId) return;

    const loadMismatches = async () => {
      setLoadingMismatches(true);
      try {
        const res = await fetch(
          `/api/sterilization/mismatches?encounterId=${invoice.encounterId}&status=UNRESOLVED`
        );
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) {
          setUnresolvedMismatches(data);
        } else {
          setUnresolvedMismatches([]);
        }
      } catch (err) {
        console.error("Failed to load mismatches:", err);
        setUnresolvedMismatches([]);
      } finally {
        setLoadingMismatches(false);
      }
    };

    void loadMismatches();
  }, [invoice.encounterId]);

  const hasRealInvoice = !!invoice.id;
  const unpaid =
    invoice.unpaidAmount ??
    Math.max((invoice.finalAmount ?? 0) - (invoice.paidTotal ?? 0), 0);

  const walletAvailable =
    invoice.patientBalance != null && invoice.patientBalance < 0
      ? Math.abs(invoice.patientBalance)
      : 0;

  useEffect(() => {
    setEnabled({});
    setAmounts({});
    setInsuranceProviderId(null);
    setOtherNote("");
    setVoucherCode("");
    setBarterCode("");
    setEmployeeCode("");
    setEmployeeRemaining(null);
    setError("");
    setSuccess("");
    setVoucherType("");
    setVoucherMaxAmount(null);
    setAppRows([{ providerId: null, amount: "" }]);
    setTransferNote("");
    setCloseOldBalance(false);
    setSplitAllocations({});
    // Auto-force split mode when any SERVICE item already has allocations
    const hasExistingAllocations = (invoice.items || []).some(
      (it) => it.itemType === "SERVICE" && (it.alreadyAllocated ?? 0) > 0
    );
    setSplitPayment(hasExistingAllocations);
  }, [invoice.id]);

  const handleToggle = (methodKey: string, checked: boolean) => {
    // In marker workflow, only one payment method is allowed at a time.
    // When a new method is checked while hasMarker is true, deselect all others first.
    if (hasMarker && checked) {
      setEnabled({ [methodKey]: true });
      setAmounts((prev) => ({ [methodKey]: prev[methodKey] ?? "" }));
      // Reset all method-specific state that belongs to other methods
      if (methodKey !== "INSURANCE") setInsuranceProviderId(null);
      if (methodKey !== "TRANSFER") setTransferNote("");
      if (methodKey !== "OTHER") setOtherNote("");
      if (methodKey !== "BARTER") setBarterCode("");
      if (methodKey !== "EMPLOYEE_BENEFIT") {
        setEmployeeCode("");
        setEmployeeRemaining(null);
      }
      if (methodKey !== "VOUCHER") {
        setVoucherCode("");
        setVoucherType("");
        setVoucherMaxAmount(null);
      }
      if (methodKey !== "APPLICATION") {
        setAppRows([{ providerId: null, amount: "" }]);
      }
      return;
    }
    setEnabled((prev) => ({ ...prev, [methodKey]: checked }));
    if (!checked) {
      setAmounts((prev) => ({ ...prev, [methodKey]: "" }));
      if (methodKey === "INSURANCE") setInsuranceProviderId(null);
      if (methodKey === "TRANSFER") setTransferNote("");
      if (methodKey === "OTHER") setOtherNote("");
      if (methodKey === "BARTER") setBarterCode("");
      if (methodKey === "EMPLOYEE_BENEFIT") {
        setEmployeeCode("");
        setEmployeeRemaining(null);
      }
      if (methodKey === "VOUCHER") {
        setVoucherCode("");
        setVoucherType("");
        setVoucherMaxAmount(null);
      }
      if (methodKey === "APPLICATION") {
        setAppRows([{ providerId: null, amount: "" }]);
      }
    }
  };

  const handleAmountChange = (methodKey: string, value: string) => {
    setAmounts((prev) => ({ ...prev, [methodKey]: value }));
  };

  const totalEntered = paymentMethods.reduce((sum, m) => {
    if (!enabled[m.key]) return sum;

    if (m.key === "APPLICATION") {
      const appSum = appRows.reduce((s, row) => {
        const amt = Number(row.amount);
        return !amt || amt <= 0 ? s : s + amt;
      }, 0);
      return sum + appSum;
    }

    const raw = amounts[m.key] ?? "";
    const amt = Number(raw);
    if (!amt || amt <= 0) return sum;
    return sum + amt;
  }, 0);

  const remainingAfterEntered = Math.max(unpaid - totalEntered, 0);

  // Split payment derived values (when marker present)
  const hasMarker = !!invoice.hasMarker;
  const oldBalance = invoice.patientOldBalance ?? 0;
  // X = amount going to old invoices; Y = amount going to current invoice
  const amountToOld = closeOldBalance ? Math.min(totalEntered, oldBalance) : 0;
  const amountToCurrent = Math.max(totalEntered - amountToOld, 0);
  // "Хувааж төлөх" is only meaningful when some amount will go to current invoice
  const splitPaymentEnabled = amountToCurrent > 0;
  // Sum of all entered split allocations
  const splitAllocTotal = Object.values(splitAllocations).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );

  // verify employee benefit code via backend
  const handleVerifyEmployeeCode = async () => {
    setError("");
    setSuccess("");

    if (!employeeCode.trim()) {
      setError("Ажилтны хөнгөлөлтийн кодыг оруулна уу.");
      return;
    }

    try {
      const res = await fetch("/api/billing/employee-benefit/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: employeeCode.trim(),
          invoiceId: invoice.id,
          encounterId: invoice.encounterId,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error((data && data.error) || "Код шалгахад алдаа гарлаа.");
      }

      const remaining = data.remainingAmount ?? 0;
      setEmployeeRemaining(remaining);
      setSuccess(`Ажилтны код баталгаажлаа. Үлдэгдэл: ${formatMoney(remaining)} ₮`);
    } catch (e: any) {
      console.error("verify employee benefit code failed:", e);
      setEmployeeRemaining(null);
      setError(e.message || "Код шалгахад алдаа гарлаа.");
    }
  };

  // verify voucher / coupon code via backend
  const handleVerifyVoucherCode = async () => {
    setError("");
    setSuccess("");

    if (!voucherType) {
      setError("Купоны төрлийг сонгоно уу.");
      return;
    }
    if (!voucherCode.trim()) {
      setError("Купон / Ваучер кодыг оруулна уу.");
      return;
    }

    try {
      const res = await fetch("/api/billing/voucher/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: voucherType, // "MARKETING" | "GIFT"
          code: voucherCode.trim(),
          invoiceId: invoice.id,
          encounterId: invoice.encounterId,
          patientId: invoice.patientId,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error((data && data.error) || "Купон шалгахад алдаа гарлаа.");
      }

      const maxAmount = data.maxAmount ?? 0;
      setVoucherMaxAmount(maxAmount);
      setSuccess(`Купон баталгаажлаа. Ашиглах дээд дүн: ${formatMoney(maxAmount)} ₮`);
    } catch (e: any) {
      console.error("verify voucher code failed:", e);
      setVoucherMaxAmount(null);
      setError(e.message || "Купон шалгахад алдаа гарлаа.");
    }
  };

  // Generate QPay QR
  const handleGenerateQPayQR = async () => {
    const qpayAmount = amounts["QPAY"] ? Number(amounts["QPAY"]) : 0;

    if (!qpayAmount || qpayAmount <= 0) {
      setError("QPay дүн оруулна уу.");
      return;
    }

    if (qpayAmount > unpaid) {
      setError("QPay дүн нь үлдэгдлээс их байна.");
      return;
    }

    setQpayGenerating(true);
    setQpayError("");

    try {
      const res = await fetch("/api/qpay/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: qpayAmount,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        throw new Error((data && data.error) || "QPay QR үүсгэхэд алдаа гарлаа.");
      }

      setQpayInvoiceId(data.qpayInvoiceId);
      setQpayQrImage(data.qrImage);
      setQpayQrText(data.qrText);
      setQpayUrls(data.urls || []);
      setQpayModalOpen(true);
      setQpayPolling(true);
    } catch (e: any) {
      console.error("Generate QPay QR failed:", e);
      setQpayError(e.message || "QPay QR үүсгэхэд алдаа гарлаа.");
    } finally {
      setQpayGenerating(false);
    }
  };

  // Close QPay modal and stop polling
  const handleCloseQPayModal = () => {
    setQpayModalOpen(false);
    setQpayPolling(false);
    setQpayInvoiceId(null);
    setQpayQrImage(null);
    setQpayQrText(null);
    setQpayUrls([]);
    setQpayPaidAmount(null);
    setQpayError("");
  };

  // QPay polling configuration
  const QPAY_POLL_INTERVAL_MS = 3000;

  // Poll QPay status with recursive setTimeout to prevent overlapping requests
  useEffect(() => {
    if (!qpayPolling || !qpayInvoiceId) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const pollPaymentStatus = async () => {
      if (isCancelled) return;

      try {
        const res = await fetch("/api/qpay/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qpayInvoiceId }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
          console.error("QPay check failed:", data);
          // Schedule next poll
          if (!isCancelled) {
            timeoutId = setTimeout(pollPaymentStatus, QPAY_POLL_INTERVAL_MS);
          }
          return;
        }

        if (data.paid) {
          setQpayPaidAmount(data.paidAmount);
          setQpayPolling(false);

          // Auto-settle
          const settlementRes = await fetch(`/api/invoices/${invoice.id}/settlement`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: data.paidAmount,
              method: "QPAY",
              meta: {
                qpayInvoiceId,
                qpayPaymentId: data.paymentId,
              },
            }),
          });

          const settlementData = await settlementRes.json().catch(() => null);

          if (!settlementRes.ok || !settlementData) {
            setQpayError(
              (settlementData && settlementData.error) ||
                "Төлбөр бүртгэхэд алдаа гарлаа. Дахин оролдоно уу."
            );
            return;
          }

          // Success - update invoice and close modal
          onUpdated({ ...invoice, ...settlementData });
          handleCloseQPayModal();
          setSuccess("QPay төлбөр амжилттай бүртгэгдлээ.");
        } else {
          // Not paid yet, schedule next poll
          if (!isCancelled) {
            timeoutId = setTimeout(pollPaymentStatus, QPAY_POLL_INTERVAL_MS);
          }
        }
      } catch (e: any) {
        console.error("QPay polling error:", e);
        // Schedule next poll even on error
        if (!isCancelled) {
          timeoutId = setTimeout(pollPaymentStatus, QPAY_POLL_INTERVAL_MS);
        }
      }
    };

    // Start polling
    pollPaymentStatus();

    // Cleanup on unmount or when polling stops
    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [qpayPolling, qpayInvoiceId, invoice, onUpdated]);

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!hasRealInvoice || !invoice.id) {
      setError("Эхлээд нэхэмжлэлийн бүтцийг хадгална уу.");
      return;
    }

    const entries: { method: string; amount: number; meta?: any }[] = [];

    for (const m of paymentMethods) {
      if (!enabled[m.key]) continue;

      if (m.key === "APPLICATION") {
        const validRows = appRows.filter((r) => r.providerId && Number(r.amount) > 0);

        if (validRows.length === 0) {
          setError("Аппликэйшнээр төлбөр сонгосон бол дор хаяж нэг мөр бөглөнө үү.");
          return;
        }

        for (const row of validRows) {
          const amt = Number(row.amount);
          entries.push({
            method: "APPLICATION",
            amount: amt,
            meta: { providerId: row.providerId },
          });
        }

        continue;
      }

      const raw = amounts[m.key] ?? "";
      const amt = Number(raw);
      if (!amt || amt <= 0) continue;

      const entry: { method: string; amount: number; meta?: any } = {
        method: m.key,
        amount: amt,
      };

      // TRANSFER: require providerId (bank)
      if (m.key === "TRANSFER") {
  if (transferNote.trim()) {
    entry.meta = { ...(entry.meta || {}), note: transferNote.trim() };
  }
}

      // INSURANCE: require providerId
      if (m.key === "INSURANCE") {
        if (!insuranceProviderId) {
          setError("Даатгалын компанийг сонгоно уу.");
          return;
        }
        entry.meta = { ...(entry.meta || {}), providerId: insuranceProviderId };
      }

      // OTHER: optional note
      if (m.key === "OTHER") {
        if (otherNote.trim()) {
          entry.meta = { ...(entry.meta || {}), note: otherNote.trim() };
        }
      }

      if (m.key === "VOUCHER") {
        if (!voucherType) {
          setError("Купоны төрлийг сонгоно уу.");
          return;
        }
        if (!voucherCode.trim()) {
          setError("Купон / Ваучер кодыг оруулна уу.");
          return;
        }
        if (voucherMaxAmount == null) {
          setError("Купоныг эхлээд 'Шалгах' товчоор баталгаажуулна уу.");
          return;
        }
        if (amt > voucherMaxAmount) {
          setError("Оруулсан дүн нь купоны боломжит дүнгээс их байна.");
          return;
        }
        entry.meta = { ...(entry.meta || {}), type: voucherType, code: voucherCode.trim() };
      }

      if (m.key === "BARTER") {
        if (!barterCode.trim()) {
          setError("Бартерын кодыг оруулна уу.");
          return;
        }
        entry.meta = { ...(entry.meta || {}), code: barterCode.trim() };
      }

      if (m.key === "EMPLOYEE_BENEFIT") {
        if (!employeeCode.trim()) {
          setError("Ажилтны хөнгөлөлтийн кодыг оруулна уу.");
          return;
        }
        if (employeeRemaining != null && amt > employeeRemaining) {
          setError("Оруулсан дүн ажилтны үлдэгдлээс их байна.");
          return;
        }
        entry.meta = { ...(entry.meta || {}), employeeCode: employeeCode.trim() };
      }

      if (m.key === "WALLET") {
        if (walletAvailable <= 0) {
          setError("Үйлчлүүлэгчид ашиглах боломжтой хэтэвчийн үлдэгдэл алга байна.");
          return;
        }
        if (amt > walletAvailable) {
          setError("Оруулсан хэтэвчийн дүн нь боломжит үлдэгдлээс их байна.");
          return;
        }
      }

      entries.push(entry);
    }

    if (entries.length === 0) {
      setError("Төлбөрийн аргыг сонгож дүнгээ оруулна уу.");
      return;
    }

    // Validate split allocations when "Хувааж төлөх" is enabled
    if (hasMarker && splitPayment && splitPaymentEnabled) {
      if (Math.abs(splitAllocTotal - amountToCurrent) > PAYMENT_ALLOCATION_TOLERANCE) {
        setError(
          `Хуваалтын нийлбэр (${formatMoney(splitAllocTotal)} ₮) нь өнөөдрийн үйлчилгээ рүү орох дүнтэй (${formatMoney(amountToCurrent)} ₮) тэнцэхгүй байна.`
        );
        return;
      }
      // Validate each allocation ≤ remaining (lineTotal − alreadyAllocated)
      for (const item of invoice.items.filter((it) => it.itemType === "SERVICE")) {
        if (!item.id) continue;
        const allocAmt = Number(splitAllocations[item.id] || 0);
        const lineTotal = item.lineTotal ?? item.unitPrice * item.quantity;
        const alreadyAllocated = item.alreadyAllocated ?? 0;
        const remainingForItem = Math.max(lineTotal - alreadyAllocated, 0);
        if (allocAmt > remainingForItem + PAYMENT_ALLOCATION_TOLERANCE) {
          setError(`"${item.name}" үйлчилгээний хуваалт үлдэгдэл дүнгээс хэтэрсэн байна (үлдэгдэл: ${formatMoney(remainingForItem)} ₮).`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      let latest: InvoiceResponse | null = null;

      if (hasMarker && (closeOldBalance || (splitPayment && splitPaymentEnabled))) {
        // Use batch-settlement endpoint for split-payment workflow
        // Note: batch-settlement only supports single-entry payments; take first non-zero entry
        if (entries.length > 1) {
          setError("Хувааж төлөх горимд нэг төлбөрийн аргыг л сонгоно уу.");
          setSubmitting(false);
          return;
        }
        const entry = entries[0];

        const allocPayload =
          splitPayment && splitPaymentEnabled
            ? invoice.items
                .filter((it) => it.itemType === "SERVICE" && it.id)
                .map((it) => ({
                  invoiceItemId: it.id as number,
                  amount: Number(splitAllocations[it.id as number] || 0),
                }))
                .filter((a) => a.amount > 0)
            : undefined;

        const res = await fetch(`/api/billing/encounters/${invoice.encounterId}/batch-settlement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: entry.amount,
            method: entry.method,
            closeOldBalance,
            splitAllocations: allocPayload,
            meta: entry.meta ?? null,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          if (isSterilizationError(data)) {
            throw new Error("Ариутгалын багажийн зөрүү шийдвэрлээгүй байна. Эхлээд зөрүүг шийдвэрлэнэ үү.");
          }
          throw new Error((data && data.error) || "Төлбөр бүртгэхэд алдаа гарлаа.");
        }

        latest = { ...invoice, ...data };
      } else {
        // Standard settlement (no marker or neither checkbox checked)
        for (const entry of entries) {
          const res = await fetch(`/api/invoices/${invoice.id}/settlement`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: entry.amount,
              method: entry.method,
              meta: entry.meta ?? null,
            }),
          });

          const data = await res.json().catch(() => null);

          if (!res.ok || !data) {
            if (isSterilizationError(data)) {
              throw new Error("Ариутгалын багажийн зөрүү шийдвэрлээгүй байна. Эхлээд зөрүүг шийдвэрлэнэ үү.");
            }
            throw new Error((data && data.error) || "Төлбөр бүртгэхэд алдаа гарлаа.");
          }

          latest = { ...invoice, ...data };
        }
      }

      if (latest) {
        onUpdated(latest);
      }

      setSuccess("Төлбөр(үүд) амжилттай бүртгэгдлээ.");
      setEnabled({});
      setAmounts({});
      setInsuranceProviderId(null);
      setOtherNote("");
      setVoucherCode("");
      setBarterCode("");
      setEmployeeCode("");
      setEmployeeRemaining(null);
      setVoucherType("");
      setVoucherMaxAmount(null);
      setAppRows([{ providerId: null, amount: "" }]);
      setCloseOldBalance(false);
      setSplitPayment(false);
      setSplitAllocations({});
    } catch (err: any) {
      console.error("Failed to settle invoice:", err);
      setError(err.message || "Төлбөр бүртгэхэд алдаа гарлаа.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-4 p-4 rounded-lg border border-gray-200 bg-white">
      <h2 className="text-base m-0 mb-2">
        Төлбөр бүртгэх
      </h2>

      {!hasRealInvoice && (
        <div className="text-[13px] text-red-700 mb-2">
          Нэхэмжлэлийн мөрүүдийг хадгалсны дараа төлбөр бүртгэх боломжтой.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2"
      >
        {/* ── Split payment controls (only when marker service present) ── */}
        {hasMarker && hasRealInvoice && (
          <div className="p-3 rounded-lg border border-[#fbbf24] bg-amber-50 flex flex-col gap-2 mb-1">
            {/* Checkbox: close old balance */}
            <div className="flex items-center gap-2">
              <input
                id="closeOldBalance"
                type="checkbox"
                checked={closeOldBalance}
                onChange={(e) => {
                  setCloseOldBalance(e.target.checked);
                  if (!e.target.checked) {
                    setSplitPayment(false);
                  }
                }}
              />
              <label htmlFor="closeOldBalance" className="text-[13px] cursor-pointer font-medium">
                Төлбөрийн үлдэгдлийг дуусгах{" "}
                <span className="text-amber-600">
                  (өмнөх үлдэгдэл: {formatMoney(oldBalance)} ₮)
                </span>
              </label>
            </div>

            {/* Breakdown when closeOldBalance is checked */}
            {closeOldBalance && (
              <div className="ml-[26px] text-[13px] flex flex-col gap-0.5 text-gray-700">
                <div>
                  Өмнөх үлдэгдэлд орох:{" "}
                  <strong className="text-amber-600">{formatMoney(amountToOld)} ₮</strong>
                </div>
                <div>
                  Өнөөдрийн үйлчилгээ рүү орох:{" "}
                  <strong className="text-green-700">{formatMoney(amountToCurrent)} ₮</strong>
                </div>
              </div>
            )}

            {/* Checkbox: split payment (only enabled when Y > 0) */}
            <div className="flex items-center gap-2">
              <input
                id="splitPayment"
                type="checkbox"
                checked={splitPayment}
                disabled={!splitPaymentEnabled}
                onChange={(e) => {
                  setSplitPayment(e.target.checked);
                  if (!e.target.checked) setSplitAllocations({});
                }}
              />
              <label
                htmlFor="splitPayment"
                className={`text-[13px] font-medium ${splitPaymentEnabled ? "cursor-pointer text-gray-900" : "cursor-not-allowed text-gray-400"}`}
              >
                Хувааж төлөх{" "}
                {!splitPaymentEnabled && closeOldBalance && (
                  <span className="font-normal">(өнөөдрийн үйлчилгээ рүү орох дүн 0)</span>
                )}
              </label>
            </div>

            {/* Per-service allocation inputs */}
            {splitPayment && splitPaymentEnabled && (
              <div className="ml-[26px]">
                <div className="text-xs text-gray-500 mb-[6px]">
                  Нийт {formatMoney(amountToCurrent)} ₮-г үйлчилгээнүүдэд хувааж оруулна уу:
                </div>
                {invoice.items.map((item) => {
                  if (item.itemType !== "SERVICE") {
                    return (
                      <div
                        key={item.id ?? `p-${item.productId}`}
                        className="flex items-center gap-2 mb-1 text-[13px] text-gray-400"
                      >
                        <div className="flex-1">{item.name}</div>
                        <div className="w-[90px] text-right">—</div>
                        <span className="text-xs">₮</span>
                      </div>
                    );
                  }
                  const itemId = item.id;
                  const lineTotal = item.lineTotal ?? item.unitPrice * item.quantity;
                  const alreadyAllocated = item.alreadyAllocated ?? 0;
                  const remainingForItem = Math.max(lineTotal - alreadyAllocated, 0);
                  return (
                    <div
                      key={itemId ?? `s-${item.serviceId}`}
                      className="flex items-center gap-2 mb-1 text-[13px]"
                    >
                      <div className="flex-1">
                        {item.name}{" "}
                        <span className="text-gray-500 text-xs">
                          (Үлдэгдэл: {formatMoney(remainingForItem)} ₮)
                        </span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={remainingForItem}
                        value={itemId != null ? (splitAllocations[itemId] ?? "") : ""}
                        onChange={(e) => {
                          if (itemId == null) return;
                          setSplitAllocations((prev) => ({
                            ...prev,
                            [itemId]: e.target.value,
                          }));
                        }}
                        placeholder="0"
                        className="w-[90px] rounded-md border border-gray-300 py-[3px] px-[6px] text-[13px] text-right"
                      />
                      <span className="text-xs">₮</span>
                    </div>
                  );
                })}
                <div
                  className={`text-xs mt-1 ${Math.abs(splitAllocTotal - amountToCurrent) <= PAYMENT_ALLOCATION_TOLERANCE ? "text-green-700" : "text-red-700"}`}
                >
                  Нийлбэр: {formatMoney(splitAllocTotal)} ₮ / {formatMoney(amountToCurrent)} ₮
                </div>
              </div>
            )}
          </div>
        )}

        {loadingMethods ? (
          <div className="text-[13px] text-gray-500">
            Төлбөрийн аргууд ачаалж байна...
          </div>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {paymentMethods.map((m) => {
              const checked = !!enabled[m.key];
              const value = amounts[m.key] ?? "";
              const providers = m.providers || [];
              return (
                <div
                  key={m.key}
                  className="flex flex-col gap-1 text-[13px]"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`pay-${m.key}`}
                      checked={checked}
                      onChange={(e) => handleToggle(m.key, e.target.checked)}
                    />
                    <label
                      htmlFor={`pay-${m.key}`}
                      className="min-w-[180px] cursor-pointer flex items-center gap-1"
                    >
                      <span>{m.label}</span>
                  </label>
                </div>

                {checked && (
                  <div className="flex items-center gap-2 ml-[26px]">
                    {/* TRANSFER: bank selector */}
                    {m.key === "TRANSFER" && (
  <input
    type="text"
    value={transferNote}
    onChange={(e) => setTransferNote(e.target.value)}
    placeholder="Тайлбар (заавал биш)"
    className="w-[200px] rounded-md border border-gray-300 py-1 px-[6px] text-xs"
  />
)}

                    {/* INSURANCE: insurance company selector */}
                    {m.key === "INSURANCE" && providers.length > 0 && (
                      <select
                        value={insuranceProviderId || ""}
                        onChange={(e) =>
                          setInsuranceProviderId(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="min-w-[200px] rounded-md border border-gray-300 py-1 px-[6px] text-[13px]"
                      >
                        <option value="">
                          Даатгалын компанийг сонгох...
                        </option>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* APPLICATION: multiple rows */}
                    {m.key === "APPLICATION" && providers.length > 0 && (
  <div className="flex flex-col gap-1 flex-1">
    {appRows.map((row, idx) => (
      <div
        key={idx}
        className="flex items-center gap-[6px]"
      >
        <select
          value={row.providerId || ""}
          onChange={(e) =>
            setAppRows((prev) =>
              prev.map((r, i) =>
                i === idx ? { ...r, providerId: e.target.value ? Number(e.target.value) : null } : r
              )
            )
          }
          className="min-w-[160px] rounded-md border border-gray-300 py-1 px-[6px] text-xs"
        >
          <option value="">Аппликэйшнийг сонгох...</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={0}
          value={row.amount}
          onChange={(e) =>
            setAppRows((prev) =>
              prev.map((r, i) =>
                i === idx ? { ...r, amount: e.target.value } : r
              )
            )
          }
          placeholder="0"
          className="w-[100px] rounded-md border border-gray-300 py-1 px-[6px] text-xs text-right"
        />
        <span className="text-xs">₮</span>

        {appRows.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setAppRows((prev) => prev.filter((_, i) => i !== idx))
            }
            className="py-0.5 px-[6px] rounded border border-red-600 bg-red-50 text-red-700 text-[11px] cursor-pointer"
          >
            −
          </button>
        )}
      </div>
    ))}

    <button
      type="button"
      onClick={() =>
        setAppRows((prev) => [...prev, { providerId: null, amount: "" }])
      }
      className="self-start mt-0.5 py-0.5 px-[6px] rounded-full border border-blue-600 bg-blue-50 text-blue-600 text-[11px] cursor-pointer"
    >
      + Нэмэх
    </button>
  </div>
)}

                    {m.key === "VOUCHER" && (
  <div className="flex items-center gap-[6px]">
    <select
      value={voucherType}
      onChange={(e) =>
        setVoucherType(
          e.target.value as "MARKETING" | "GIFT" | ""
        )
      }
      className="rounded-md border border-gray-300 py-1 px-[6px] text-xs"
    >
      <option value="">Төрөл сонгох...</option>
      <option value="MARKETING">
        Маркетинг купон (15,000₮)
      </option>
      <option value="GIFT">Бэлгийн карт</option>
    </select>

    <input
      type="text"
      value={voucherCode}
      onChange={(e) => setVoucherCode(e.target.value)}
      placeholder="Код"
      className="w-[120px] rounded-md border border-gray-300 py-1 px-[6px] text-xs"
    />

    <button
      type="button"
      onClick={handleVerifyVoucherCode}
      className="py-1 px-2 rounded border border-blue-600 bg-blue-50 text-blue-600 text-[11px] cursor-pointer"
    >
      Шалгах
    </button>

    {voucherMaxAmount != null && (
      <span className="text-xs text-green-600 ml-1">
        Дээд дүн: {formatMoney(voucherMaxAmount)} ₮
      </span>
    )}
  </div>
)}

                    {m.key === "BARTER" && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={barterCode}
                          onChange={(e) =>
                            setBarterCode(e.target.value)
                          }
                          placeholder="Бартерын код"
                          className="w-[140px] rounded-md border border-gray-300 py-1 px-[6px] text-xs"
                        />
                      </div>
                    )}

                    {m.key === "EMPLOYEE_BENEFIT" && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={employeeCode}
                          onChange={(e) =>
                            setEmployeeCode(e.target.value)
                          }
                          placeholder="Ажилтны код"
                          className="w-[140px] rounded-md border border-gray-300 py-1 px-[6px] text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyEmployeeCode}
                          className="py-1 px-2 rounded border border-blue-600 bg-blue-50 text-blue-600 text-[11px] cursor-pointer"
                        >
                          Шалгах
                        </button>
                        {employeeRemaining != null && (
                          <span className="text-xs text-green-600 ml-1">
                            Үлдэгдэл:{" "}
                            {formatMoney(employeeRemaining)} ₮
                          </span>
                        )}
                      </div>
                    )}

                    {/* OTHER: optional note field */}
                    {m.key === "OTHER" && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={otherNote}
                          onChange={(e) => setOtherNote(e.target.value)}
                          placeholder="Тайлбар (заавал биш)"
                          className="w-[200px] rounded-md border border-gray-300 py-1 px-[6px] text-xs"
                        />
                      </div>
                    )}

                    {m.key === "WALLET" && (
                      <div
                        className={`text-xs ${walletAvailable > 0 ? "text-green-600" : "text-gray-500"}`}
                      >
                        Хэтэвчийн боломжит үлдэгдэл:{" "}
                        <strong>
                          {formatMoney(walletAvailable)} ₮
                        </strong>
                      </div>
                    )}

                    {/* QPAY: Generate QR button */}
                    {m.key === "QPAY" && (
                      <div className="flex items-center gap-[6px]">
                        <button
                          type="button"
                          onClick={handleGenerateQPayQR}
                          disabled={qpayGenerating}
                          className={`py-1 px-2 rounded border border-blue-600 bg-blue-50 text-blue-600 text-[11px] ${qpayGenerating ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {qpayGenerating ? "Үүсгэж байна..." : "QR үүсгэх"}
                        </button>
                      </div>
                    )}

                                        {m.key !== "APPLICATION" && (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={(e) =>
                            handleAmountChange(m.key, e.target.value)
                          }
                          placeholder="0"
                          className="flex-1 rounded-md border border-gray-300 py-1 px-2 text-[13px] text-right"
                        />
                        <span className="text-xs">₮</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        <div className="text-xs text-[#4b5563] mt-1 flex flex-col gap-0.5">
          {invoice.paidTotal != null || invoice.unpaidAmount != null ? (
            <>
              <div>
                Нийт төлсөн (өмнө):{" "}
                <strong>{formatMoney(invoice.paidTotal || 0)} ₮</strong>
              </div>
              <div>
                Үлдэгдэл (одоогийн):{" "}
                <strong>{formatMoney(unpaid)} ₮</strong>
              </div>
            </>
          ) : null}
          <div>
            Энэ удаад оруулсан дүн:{" "}
            <strong>{formatMoney(totalEntered)} ₮</strong>
          </div>
          <div>
            Үлдэгдэл (энэ удаагийн дараа, онолын):{" "}
            <strong>{formatMoney(remainingAfterEntered)} ₮</strong>
          </div>
        </div>

        {/* Sterilization Mismatch Warning */}
        {unresolvedMismatches.length > 0 && (
          <div className="bg-amber-100 border border-[#f59e0b] rounded-lg p-3 mt-3 text-[13px]">
            <div className="font-semibold text-amber-800 mb-1">
              ⚠️ Ариутгалын тохиргоо дутуу байна
            </div>
            <div className="text-[#78350f] mb-2">
              Энэ үзлэгт {unresolvedMismatches.length} ширхэг ариутгалын багажийн зөрүү шийдвэрлэгдээгүй байна. 
              Төлбөр батлах боломжгүй.
            </div>
            <a
              href="/sterilization/mismatches"
              className="text-[#1e40af] underline cursor-pointer"
            >
              Зөрүү шийдвэрлэх хуудас руу шилжих →
            </a>
          </div>
        )}

        {error && (
          <div className="text-[13px] text-red-700 mt-1">
            {error}
          </div>
        )}
        {success && (
          <div className="text-[13px] text-green-600 mt-1">
            {success}
          </div>
        )}

        <div className="mt-1 flex justify-end">
          <button
            type="submit"
            disabled={submitting || !hasRealInvoice || unresolvedMismatches.length > 0}
            className={`py-2 px-4 rounded-md border-none text-white text-sm ${hasRealInvoice && unresolvedMismatches.length === 0 ? "bg-[#16a34a] cursor-pointer" : "bg-gray-400 cursor-not-allowed"}`}
          >
            {submitting ? "Төлбөр хадгалж байна..." : "Төлбөр бүртгэх"}
          </button>
        </div>
      </form>

      {invoice.payments && invoice.payments.length > 0 && (
        <div className="mt-3 text-xs">
          <div className="font-semibold mb-1">
            Бүртгэгдсэн төлбөрүүд
          </div>
          <ul className="m-0 pl-4">
            {invoice.payments.map((p) => (
              <li key={p.id}>
                {formatDateTime(p.timestamp)} — {p.method} — {formatAuditUserDisplay(p.createdByUser)} —{" "}
                {formatMoney(p.amount)} ₮
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* QPay QR Modal */}
      {qpayModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90]"
          onClick={handleCloseQPayModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[95vw] max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-2xl p-5 text-sm"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0 text-lg font-semibold">
                QPay Төлбөр
              </h3>
              <button
                type="button"
                onClick={handleCloseQPayModal}
                className="border-none bg-transparent cursor-pointer text-2xl leading-none text-gray-500"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {qpayError && (
              <div className="mb-3 p-[10px] rounded-md bg-red-50 text-red-700 text-[13px]">
                {qpayError}
              </div>
            )}

            {qpayPaidAmount ? (
              <div className="mb-3 p-3 rounded-md bg-[#f0fdf4] text-green-700 text-sm font-medium text-center">
                ✓ Төлбөр амжилттай төлөгдлөө: {formatMoney(qpayPaidAmount)} ₮
              </div>
            ) : (
              <>
                <div className="mb-3 p-[10px] rounded-md bg-blue-50 text-[#1e40af] text-[13px] text-center">
                  {qpayPolling
                    ? "Төлбөр хүлээж байна... (3 секунд тутамд шалгана)"
                    : "QR код уншуулах эсвэл холбоос дарна уу"}
                </div>

                {qpayQrImage && (
                  <div className="mb-4 flex justify-center">
                    <img
                      src={qpayQrImage}
                      alt="QPay QR Code"
                      className="max-w-[240px] h-auto border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                )}

                {qpayQrText && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-1">
                      QR текст:
                    </div>
                    <div className="p-2 rounded-md bg-gray-50 border border-gray-200 text-[11px] break-all font-mono">
                      {qpayQrText}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(qpayQrText);
                        setSuccess("QR текст хуулагдлаа");
                      }}
                      className="mt-[6px] py-1 px-2 rounded border border-blue-600 bg-blue-50 text-blue-600 text-[11px] cursor-pointer"
                    >
                      Хуулах
                    </button>
                  </div>
                )}

                {qpayUrls && qpayUrls.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-[6px]">
                      Апп-аар төлөх:
                    </div>
                    <div className="flex flex-col gap-[6px]">
                      {qpayUrls.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="py-2 px-3 rounded-md border border-blue-600 bg-blue-50 text-blue-600 no-underline text-xs text-center"
                        >
                          Холбоос #{idx + 1} нээх
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={handleCloseQPayModal}
                className="py-2 px-4 rounded-md border border-gray-300 bg-white text-gray-700 text-[13px] cursor-pointer"
              >
                Хаах
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ----------------- e-Barimt section -----------------

function BillingEbarimtSection({
  invoice,
  onUpdated,
}: {
  invoice: InvoiceResponse;
  onUpdated: (inv: InvoiceResponse) => void;
}) {
  const isPaid =
    invoice.id != null &&
    ((invoice.unpaidAmount != null && invoice.unpaidAmount <= 0) ||
      (invoice.paidTotal != null &&
        invoice.finalAmount != null &&
        invoice.paidTotal >= invoice.finalAmount));

  const isLocked = !!invoice.hasEBarimt;

  const [buyerType, setBuyerType] = React.useState<"B2C" | "B2B">(
    invoice.buyerType ?? "B2C"
  );
  const [buyerTin, setBuyerTin] = React.useState<string>(
    invoice.buyerTin ?? ""
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [issuedDdtd, setIssuedDdtd] = React.useState<string | null>(null);
  const [issuedPrintedAtText, setIssuedPrintedAtText] = React.useState<string | null>(null);
  const [receiptForDisplay, setReceiptForDisplay] = React.useState<ReceiptForDisplay | null>(null);

  // Unified receipt source: immediate issuance result (in-session) or persisted DB data (after refresh)
  const receipt: ReceiptForDisplay | null =
    receiptForDisplay ??
    (invoice.ebarimtReceipt?.status === "SUCCESS"
      ? {
          id: invoice.ebarimtReceipt.ddtd ?? undefined,
          date: invoice.ebarimtReceipt.printedAtText ?? undefined,
          lottery: invoice.ebarimtReceipt.lottery ?? undefined,
          totalAmount: invoice.ebarimtReceipt.totalAmount ?? undefined,
          qrData: invoice.ebarimtReceipt.qrData ?? undefined,
        }
      : null);

  // Sync buyer info when invoice changes (e.g. after payment or navigation)
  React.useEffect(() => {
    setBuyerType(invoice.buyerType ?? "B2C");
    setBuyerTin(invoice.buyerTin ?? "");
    setError("");
    setSuccess("");
    setIssuedDdtd(null);
    setIssuedPrintedAtText(null);
    setReceiptForDisplay(null);
  }, [invoice.id]);

  const disabled = !isPaid || isLocked;

  const handleSave = async () => {
    if (!invoice.id) return;
    setError("");
    setSuccess("");
    setIssuedDdtd(null);
    setIssuedPrintedAtText(null);
    setReceiptForDisplay(null);
    setSaving(true);
    try {
      // Step 1: Save buyer info
      const body: { buyerType: string; buyerTin?: string | null } = { buyerType };
      if (buyerType === "B2B") {
        body.buyerTin = buyerTin.trim() || null;
      } else {
        body.buyerTin = null;
      }
      const patchRes = await fetch(`/api/invoices/${invoice.id}/buyer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const patchData = await patchRes.json().catch(() => null);
      if (!patchRes.ok) {
        throw new Error((patchData && patchData.error) || "Худалдан авагчийн мэдээлэл хадгалахад алдаа гарлаа.");
      }

      // Step 2: Issue e-Barimt
      const issueRes = await fetch(`/api/ebarimt/invoices/${invoice.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const issueData = await issueRes.json().catch(() => null);

      if (issueRes.status === 409) {
        // Already issued — treat as success, refresh invoice
        onUpdated({ ...invoice, buyerType: patchData.buyerType, buyerTin: patchData.buyerTin ?? null, hasEBarimt: true });
        return;
      }

      if (!issueRes.ok) {
        // Buyer info saved, but issuance failed — show retryable error
        onUpdated({ ...invoice, buyerType: patchData.buyerType, buyerTin: patchData.buyerTin ?? null });
        throw new Error("e-Barimt гаргахад алдаа гарлаа. Дахин оролдоно уу.");
      }

      const ddtd = issueData?.ddtd ?? null;
      const printedAtText = issueData?.receiptForDisplay?.printedAtText ?? issueData?.receiptForDisplay?.date ?? null;
      setIssuedDdtd(ddtd);
      setIssuedPrintedAtText(printedAtText);
      if (issueData?.receiptForDisplay) {
        setReceiptForDisplay(issueData.receiptForDisplay as ReceiptForDisplay);
      }
      setSuccess("e-Barimt амжилттай гаргалаа.");
      onUpdated({
        ...invoice,
        buyerType: patchData.buyerType,
        buyerTin: patchData.buyerTin ?? null,
        hasEBarimt: true,
      });
    } catch (err: any) {
      setError(err.message || "Алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-4 p-4 rounded-lg border border-gray-200 bg-white">
      <h2 className="text-base m-0 mb-2">
        e-Barimt
      </h2>

      {!isPaid && (
        <div className="text-[13px] text-gray-500 mb-2">
          Нэхэмжлэл бүрэн төлөгдсөний дараа e-Barimt мэдээлэл оруулах боломжтой.
        </div>
      )}

      {isLocked && (
        <div className="text-[13px] text-amber-800 bg-amber-100 border border-[#fcd34d] rounded-md py-[6px] px-[10px] mb-2">
          e-Barimt баримт аль хэдийн гаргасан тул худалдан авагчийн мэдээллийг өөрчлөх боломжгүй.
        </div>
      )}

      {isLocked && invoice.ebarimtReceipt?.status === "SUCCESS" && !receipt && (
        <div className="mb-2 py-[10px] px-[14px] bg-[#f0fdf4] border border-[#86efac] rounded-lg font-mono text-[13px] flex flex-col gap-1">
          <div className="font-bold text-sm mb-0.5">✅ e-Barimt гаргасан</div>
          {invoice.ebarimtReceipt.ddtd && (
            <div><strong>ДДТД:</strong> {invoice.ebarimtReceipt.ddtd}</div>
          )}
          {invoice.ebarimtReceipt.printedAtText && (
            <div><strong>Огноо:</strong> {invoice.ebarimtReceipt.printedAtText}</div>
          )}
          {invoice.ebarimtReceipt.totalAmount != null && (
            <div><strong>Нийт дүн:</strong> {formatMoney(invoice.ebarimtReceipt.totalAmount)}₮</div>
          )}
        </div>
      )}

      <div
        className={`flex flex-col gap-[10px] ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Buyer type selector */}
        <div className="flex gap-4 items-center">
          <label className="text-[13px] font-medium min-w-[120px]">
            Худалдан авагч:
          </label>
          <label className="text-[13px] flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="buyerType"
              value="B2C"
              checked={buyerType === "B2C"}
              disabled={disabled}
              onChange={() => {
                setBuyerType("B2C");
                setBuyerTin("");
              }}
            />
            Хувь хүн
          </label>
          <label className="text-[13px] flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="buyerType"
              value="B2B"
              checked={buyerType === "B2B"}
              disabled={disabled}
              onChange={() => setBuyerType("B2B")}
            />
            Байгууллага
          </label>
        </div>

        {/* TIN input (only for B2B) */}
        {buyerType === "B2B" && (
          <div className="flex gap-2 items-center">
            <label className="text-[13px] font-medium min-w-[120px]">
              ТТД (TIN):
            </label>
            <input
              type="text"
              value={buyerTin}
              onChange={(e) => setBuyerTin(e.target.value.replace(/\D/g, ""))}
              placeholder="11 эсвэл 14 оронтой тоо"
              disabled={disabled}
              maxLength={14}
              className="py-[5px] px-2 rounded-md border border-gray-300 text-[13px] w-[200px]"
            />
          </div>
        )}

        {/* Save & Issue button */}
        {invoice.id != null && (
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || saving}
              className={`py-[6px] px-[14px] rounded-md border-none text-white text-[13px] ${disabled || saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 cursor-pointer"}`}
            >
              {saving ? "e-Barimt гаргаж байна..." : "e-Barimt гаргах"}
            </button>
            {success && (
              <span className="text-[13px] text-green-700">{success}</span>
            )}
          </div>
        )}

        {(issuedDdtd || issuedPrintedAtText) && !receipt && (
          <div className="text-[13px] bg-[#f0fdf4] border border-[#86efac] rounded-md py-2 px-3 flex flex-col gap-1">
            {issuedDdtd && (
              <div>
                <span className="font-medium">Баримтын дугаар (ДДТД): </span>
                <span className="font-mono">{issuedDdtd}</span>
              </div>
            )}
            {issuedPrintedAtText && (
              <div>
                <span className="font-medium">Огноо: </span>
                {issuedPrintedAtText}
              </div>
            )}
          </div>
        )}
      </div>

      {receipt && (
        <>
          {/* @media print: only .ebarimt-receipt is visible */}
          <style>{`
  .ebarimt-receipt-print-root { display: none; }

  @media print {
    body * { visibility: hidden !important; }

    .ebarimt-receipt-print-root {
      display: block !important;
      visibility: visible !important;
      position: fixed;
      top: 0;
      left: 0;
      width: 215px;
      background: #fff;
      z-index: 9999;
    }

    .ebarimt-receipt-print-root * {
      visibility: visible !important;
    }

    @page { margin: 0; }
  }
`}</style>
          {/* Hidden full-page print container */}
          <div className="ebarimt-receipt-print-root">
            <div className="w-[215px] py-2 px-[6px] font-mono text-[11px] leading-snug">
              <div className="text-center mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://mdent.cloud/clinic-logo.png" alt="Clinic logo" className="w-[90px] h-auto" />
              </div>
            
              <div>Утас: 7715-1551</div>
              <div>И-мэйл: info@monfamily.mn</div>
              <hr className="my-1" />
              <div>ТТД: 6948472</div>
              {receipt.id && <div>ДДТД: {receipt.id}</div>}
              {(invoice.ebarimtReceipt?.ddtd) && !receipt.id && <div>ДДТД: {invoice.ebarimtReceipt.ddtd}</div>}
              {receipt.date && <div>Огноо: {receipt.date}</div>}
              {invoice.ebarimtReceipt?.id != null && <div>Дугаар: {invoice.ebarimtReceipt.id}</div>}
              {invoice.patientOvog && <div>Овог: {invoice.patientOvog}</div>}
              {invoice.patientName && <div>Нэр: {invoice.patientName}</div>}
              {invoice.patientRegNo && <div>РД: {invoice.patientRegNo}</div>}
              <hr className="my-1" />
              <div className="font-bold mb-0.5">НӨАТ-оос чөлөөлөгдөх бараа</div>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left pr-[2px]">ҮЙЛЧИЛГЭЭ</th>
                    <th className="text-right pr-[2px]">ТОО</th>
                    <th className="text-right">НИЙТ</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it, idx) => (
                    <tr key={it.id ?? idx}>
                      <td className="pr-[2px] break-words">{it.name}</td>
                      <td className="text-right pr-[2px]">{it.quantity}</td>
                      <td className="text-right">{formatMoney(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr className="my-1" />
              {receipt.qrData && (
                <div className="text-center my-[6px]">
                  <QRCodeSVG value={receipt.qrData} size={140} />
                </div>
              )}
              {receipt.lottery && <div>Сугалаа: {receipt.lottery}</div>}
              <div className="font-bold mt-0.5">
                Нийт дүн: {formatMoney(receipt.totalAmount ?? invoice.finalAmount)}₮
              </div>
            </div>
          </div>
          {/* Inline receipt preview card */}
          <div className="mt-2 py-3 px-4 bg-[#f0fdf4] border border-[#86efac] rounded-lg font-mono text-[13px] flex flex-col gap-1">
            <div className="font-bold text-[15px] text-center mb-1">
              e-БАРИМТ
            </div>
            {/* TODO: clinic name / TIN / address */}
            {receipt.id && (
              <div><strong>ДДТД:</strong> {receipt.id}</div>
            )}
            {receipt.date && (
              <div><strong>Огноо:</strong> {receipt.date}</div>
            )}
            {receipt.lottery && (
              <div><strong>Сугалаа:</strong> {receipt.lottery}</div>
            )}
            {receipt.totalAmount != null && (
              <div><strong>Нийт дүн:</strong> {formatMoney(receipt.totalAmount)}₮</div>
            )}
            {receipt.qrData && (
              <div className="mt-2 text-center">
                <QRCodeSVG value={receipt.qrData} size={120} />
              </div>
            )}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="py-[5px] px-3 rounded-md border-none bg-blue-600 text-white cursor-pointer text-[13px]"
              >
                🖨️ e-Barimt хэвлэх
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="text-[13px] text-red-700 mt-2">{error}</div>
      )}
    </section>
  );
}

// ----------------- Main page -----------------

export default function BillingPage() {
  const router = useRouter();
  const { id } = router.query;

  const encounterId = useMemo(
    () => (typeof id === "string" ? Number(id) : NaN),
    [id]
  );

  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productQuery, setProductQuery] = useState("");

  // Nurses for IMAGING rows
  const [nurses, setNurses] = useState<{ id: number; name: string | null }[]>([]);
  const [nursesLoading, setNursesLoading] = useState(false);

 // --- NEW: inline service autocomplete (per-row) ---
const [svcOpenRow, setSvcOpenRow] = useState<number | null>(null);
const [svcQueryByRow, setSvcQueryByRow] = useState<Record<number, string>>({});
const [svcLoading, setSvcLoading] = useState(false);
const [svcOptions, setSvcOptions] = useState<Service[]>([]);
const [svcActiveIndex, setSvcActiveIndex] = useState(0);
const searchServices = useCallback(
  async (q: string) => {
    const query = q.trim();
    if (query.length < 1) {
      setSvcOptions([]);
      return;
    }

    const branchId = encounter?.patientBook?.patient?.branch?.id;

    setSvcLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("onlyActive", "true");
      params.set("limit", "50");
      if (branchId) params.set("branchId", String(branchId));

      const res = await fetch(`/api/services?${params.toString()}`);
      const data = await res.json().catch(() => null);

      if (!res.ok || !Array.isArray(data)) {
        throw new Error((data && data.error) || "Service search failed");
      }

      setSvcOptions(data);
      setSvcActiveIndex(0);
    } catch (e) {
      console.error(e);
      setSvcOptions([]);
    } finally {
      setSvcLoading(false);
    }
  },
  [encounter?.patientBook?.patient?.branch?.id]
);
  
  // NEW: XRAY + consent printable info
  const [xrays, setXrays] = useState<EncounterMedia[]>([]);
  const [xraysLoading, setXraysLoading] = useState(false);
  const [xraysError, setXraysError] = useState("");

const [consents, setConsents] = useState<EncounterConsent[]>([]);
const [consentLoading, setConsentLoading] = useState(false);
const [consentError, setConsentError] = useState("");

  // Service selector state (modal removed - using inline autocomplete only)

  // ✅ NEW: load products for product modal
  const loadProducts = async () => {
    if (!encounter) {
      setProductsError("Үзлэгийн мэдээлэл ачаалагдаагүй байна.");
      return;
    }

    const branchId = encounter.patientBook.patient.branch?.id;
    if (!branchId) {
      setProductsError("Салбар тодорхойгүй байна.");
      return;
    }

    setProductsLoading(true);
    setProductsError("");

    try {
      const res = await fetch(`/api/inventory/products?branchId=${branchId}`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error((data && data.error) || "Бүтээгдэхүүн ачаалж чадсангүй.");
      }

      const list: Product[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.products)
        ? (data as any).products
        : [];

      setProducts(list);
    } catch (e: any) {
      console.error("loadProducts failed:", e);
      setProducts([]);
      setProductsError(e.message || "Бүтээгдэхүүн ачаалж чадсангүй.");
    } finally {
      setProductsLoading(false);
    }
  };

  

  // ✅ Add product row
  const handleAddRowFromProduct = (p: Product) => {
    const newRow: InvoiceItem = {
      itemType: "PRODUCT",
      productId: p.id,
      serviceId: null,
      name: p.name,
      unitPrice: Number(p.price || 0),
      quantity: 1,
      source: "MANUAL",
    };
    setItems((prev) => [...prev, newRow]);
    setProductModalOpen(false);
    setProductQuery("");
  };

  useEffect(() => {
    if (!encounterId || Number.isNaN(encounterId)) return;

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const encRes = await fetch(`/api/encounters/${encounterId}`);
        const encData = await encRes.json().catch(() => null);
        if (!encRes.ok || !encData || !encData.id) {
          throw new Error((encData && encData.error) || "Алдаа гарлаа");
        }
        setEncounter(encData);

        const invRes = await fetch(`/api/billing/encounters/${encounterId}/invoice`);
        const invData = await invRes.json().catch(() => null);
        if (!invRes.ok || !invData) {
          throw new Error((invData && invData.error) || "Төлбөрийн мэдээлэл ачаалж чадсангүй.");
        }

        const inv: InvoiceResponse = invData;
        setInvoice(inv);
        setItems(inv.items || []);
        setDiscountPercent(inv.discountPercent || 0);
      } catch (err: any) {
        console.error("Failed to load billing:", err);
        setLoadError(err.message || "Алдаа гарлаа");
        setEncounter(null);
        setInvoice(null);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [encounterId]);

  useEffect(() => {
  if (svcOpenRow == null) return;

  const q = svcQueryByRow[svcOpenRow] ?? "";
  const t = setTimeout(() => {
    void searchServices(q);
  }, 200);

  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [svcOpenRow, svcQueryByRow, searchServices]);

  // Fetch nurses for IMAGING attribution
  useEffect(() => {
    const branchId = invoice?.branchId;
    if (!branchId) return;
    const hasImaging = items.some((r) => r.serviceCategory === "IMAGING" && r.itemType === "SERVICE");
    if (!hasImaging) return;
    if (nurses.length > 0 || nursesLoading) return;
    setNursesLoading(true);
    fetch(`/api/users/nurses/today?branchId=${branchId}`)
      .then((r) => r.json())
      .then((data) => {
        const items2: { nurseId: number; name: string | null }[] = data.items || [];
        setNurses(items2.map((n) => ({ id: n.nurseId, name: n.name })));
      })
      .catch(() => {})
      .finally(() => setNursesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.branchId, items]);

  // XRAY
  useEffect(() => {
    if (!encounterId || Number.isNaN(encounterId)) return;

    const loadXrays = async () => {
      setXraysLoading(true);
      setXraysError("");
      try {
        const res = await fetch(`/api/encounters/${encounterId}/media?type=XRAY`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.error) || "XRAY ачаалж чадсангүй.");
        setXrays(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setXrays([]);
        setXraysError(e.message || "XRAY ачаалж чадсангүй.");
      } finally {
        setXraysLoading(false);
      }
    };

    void loadXrays();
  }, [encounterId]);


  
  // Consents
  useEffect(() => {
    if (!encounterId || Number.isNaN(encounterId)) return;

    const loadConsents = async () => {
      setConsentLoading(true);
      setConsentError("");
      try {
        const res = await fetch(`/api/encounters/${encounterId}/consents`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.error) || "Зөвшөөрлийн маягтууд ачаалж чадсангүй.");
        }
        setConsents(Array.isArray(data) ? (data as EncounterConsent[]) : []);
      } catch (e: any) {
        setConsents([]);
        setConsentError(e.message || "Зөвшөөрлийн маягтууд ачаалж чадсангүй.");
      } finally {
        setConsentLoading(false);
      }
    };

    void loadConsents();
  }, [encounterId]);

  const handleItemChange = (
    index: number,
    field: "name" | "quantity" | "unitPrice",
    value: string
  ) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (field === "name") return { ...row, name: value };

        const num = Number(value.replace(/\s/g, "")) || 0;
        if (field === "quantity") return { ...row, quantity: num > 0 ? num : 1 };
        if (field === "unitPrice") return { ...row, unitPrice: num >= 0 ? num : 0 };
        return row;
      })
    );
  };

  const handleMetaChange = (
    index: number,
    patch: Partial<{ assignedTo: "DOCTOR" | "NURSE"; nurseId: number | null }>
  ) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const currentMeta = row.meta || {};
        const newMeta = { ...currentMeta, ...patch };
        // If switching to DOCTOR, clear nurseId
        if (patch.assignedTo === "DOCTOR") {
          delete newMeta.nurseId;
        }
        return { ...row, meta: newMeta };
      })
    );
  };

  const handleTeethNumbersChange = (index: number, value: string) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return {
          ...row,
          teethNumbers: value.split(",").map((n) => n.trim()).filter(Boolean),
        };
      })
    );
  };

  const handleRemoveRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

 const handleAddRowFromService = () => {
  const newIndex = items.length;

  const newRow: InvoiceItem = {
    itemType: "SERVICE",
    serviceId: null,
    productId: null,
    name: "",
    unitPrice: 0,
    quantity: 1,
    source: "MANUAL",
    teethNumbers: [],
  };

  setItems((prev) => [...prev, newRow]);

  setSvcOpenRow(newIndex);
  setSvcQueryByRow((prev) => ({ ...prev, [newIndex]: "" }));
  setSvcOptions([]);
  setSvcActiveIndex(0);
};


  // --- totals (discount applies ONLY to services) ---

const servicesSubtotal = items
  .filter((row) => row.itemType === "SERVICE")
  .reduce((sum, row) => sum + (row.unitPrice || 0) * (row.quantity || 0), 0);

const productsSubtotal = items
  .filter((row) => row.itemType === "PRODUCT")
  .reduce((sum, row) => sum + (row.unitPrice || 0) * (row.quantity || 0), 0);

const totalBeforeDiscount = servicesSubtotal + productsSubtotal;

const discountFactor =
  discountPercent === 0 ? 1 : (100 - discountPercent) / 100;

const discountedServices = Math.max(
  Math.round(servicesSubtotal * discountFactor),
  0
);

// ✅ discount amount (services only)
const discountAmount = Math.max(Math.round(servicesSubtotal) - discountedServices, 0);

// ✅ final amount = discounted services + full products
const finalAmount = Math.max(discountedServices + Math.round(productsSubtotal), 0);

  const handleSaveBilling = async () => {
    if (!encounterId || Number.isNaN(encounterId)) return;
    setSaveError("");
    setSaveSuccess("");

    // Frontend validation: IMAGING rows must have meta.assignedTo
    const filteredForSave = items.filter((r) => r.serviceId || r.productId || r.name.trim());
    for (const r of filteredForSave) {
      if (r.itemType === "SERVICE" && r.serviceCategory === "IMAGING") {
        if (!r.meta?.assignedTo) {
          setSaveError("IMAGING үйлчилгээ бүрт гүйцэтгэгч (Эмч эсвэл Сувилагч) сонгоно уу.");
          return;
        }
        if (r.meta.assignedTo === "NURSE" && !r.meta.nurseId) {
          setSaveError("IMAGING үйлчилгээнд Сувилагч сонгосон бол сувилагч заавал сонгоно уу.");
          return;
        }
      }
    }

    setSaving(true);

    try {
      const payload = {
        discountPercent,
        items: filteredForSave
          .map((r) => ({
            id: r.id,
            itemType: r.itemType,
            serviceId: r.itemType === "SERVICE" ? r.serviceId : null,
            productId: r.itemType === "PRODUCT" ? r.productId : null,
            name: r.name,
            unitPrice: r.unitPrice,
            quantity: r.quantity,
            teethNumbers: r.teethNumbers,
            meta: r.itemType === "SERVICE" && r.serviceCategory === "IMAGING" && r.meta?.assignedTo
              ? { assignedTo: r.meta.assignedTo, ...(r.meta.assignedTo === "NURSE" && r.meta.nurseId ? { nurseId: r.meta.nurseId } : {}) }
              : null,
          })),
      };

      const res = await fetch(`/api/billing/encounters/${encounterId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.id) {
        throw new Error((data && data.error) || "Төлбөр хадгалахад алдаа гарлаа.");
      }

      const saved: InvoiceResponse = data;
      setInvoice(saved);
      setItems(saved.items || []);
      setDiscountPercent(saved.discountPercent || 0);
      setSaveSuccess("Нэхэмжлэлийн бүтцийг хадгаллаа.");
    } catch (err: any) {
      console.error("Failed to save invoice:", err);
      setSaveError(err.message || "Төлбөр хадгалахад алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  };

  // ---- Service modal logic removed (using inline autocomplete only) ----

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [products, productQuery]);

  // Pre-compute a Map of diagnosisId -> diagnosis row for O(1) lookup in items.map()
  const diagnosisById = useMemo(() => {
    const map = new Map<number, EncounterDiagnosisRow>();
    if (encounter?.encounterDiagnoses) {
      for (const dx of encounter.encounterDiagnoses) {
        if (dx.id != null) {
          map.set(dx.id, dx);
        }
      }
    }
    return map;
  }, [encounter?.encounterDiagnoses]);

  if (!encounterId || Number.isNaN(encounterId)) {
    return (
      <main className="max-w-[900px] my-[40px] mx-auto p-6 font-sans">
        <h1>Нэхэмжлэлийн хуудас</h1>
        <div className="text-red-600">Encounter ID буруу байна.</div>
      </main>
    );
  }

  return (
    <main className="max-w-[1000px] my-[40px] mx-auto p-6 font-sans">
      <h1 className="text-xl mb-3">Нэхэмжлэлийн хуудас (Encounter ID: {encounterId})</h1>

     {loading && <div>Ачаалж байна...</div>}
      {!loading && loadError && <div className="text-red-600 mb-3">{loadError}</div>}

      {encounter && invoice && (
        <>
          {/* Header / Encounter summary */}
<section className="mb-4 p-4 rounded-lg border border-gray-200 bg-white">
  <div className="flex justify-between items-start gap-4">
    {/* LEFT: existing patient / encounter info */}
    <div className="text-base leading-normal">
      <div className="mb-1">
        <strong>Үйлчлүүлэгч:</strong>{" "}
        {formatPatientName(encounter.patientBook.patient)} (Карт:{" "}
        {encounter.patientBook.bookNumber})
      </div>
      <div className="mb-1">
        <strong>Салбар:</strong>{" "}
        {encounter.patientBook.patient.branch
          ? encounter.patientBook.patient.branch.name
          : "-"}
      </div>
      <div className="mb-1">
        <strong>Эмч:</strong> {formatDoctorName(encounter.doctor)}
      </div>
      <div className="mb-1">
        <strong>Огноо:</strong> {formatDateTime(encounter.visitDate)}
      </div>
      {encounter.notes && (
        <div className="mt-1">
          <strong>Үзлэгийн тэмдэглэл:</strong> {encounter.notes}
        </div>
      )}
      <div className="mt-2 text-[13px]">
        <strong>Нэхэмжлэл:</strong>{" "}
        {invoice.id
          ? `#${invoice.id} – ${invoice.finalAmount.toLocaleString(
              "mn-MN"
            )}₮ (${invoice.status})`
          : "Одоогоор хадгалагдсан нэхэмжлэл байхгүй (түр санал болгосон тооцоо)."}
        {invoice.hasEBarimt && " • e-Barimt хэвлэгдсэн"}
      </div>
      {invoice.paidTotal != null && (
        <div className="mt-1 text-[13px]">
          Нийт төлсөн:{" "}
          <strong>{formatMoney(invoice.paidTotal)} ₮</strong> • Үлдэгдэл:{" "}
          <strong>{formatMoney(invoice.unpaidAmount || 0)} ₮</strong>
        </div>
      )}
    </div>

    {/* RIGHT: patient balance summary */}
    {invoice.patientBalance != null && (
      <div className="min-w-[260px] p-[10px] rounded-lg border border-gray-200 bg-gray-50 text-[13px]">
        <div className="font-semibold mb-1 text-right">
          Санхүүгийн үлдэгдэл
        </div>
        <div className="text-right">
          <div>
            Нийт нэхэмжилсэн:{" "}
            <strong>
              {formatMoney(invoice.patientTotalBilled || 0)} ₮
            </strong>
          </div>
          <div>
            Нийт төлсөн:{" "}
            <strong>
              {formatMoney(invoice.patientTotalPaid || 0)} ₮
            </strong>
          </div>
          <div>
            Үлдэгдэл (бүх үзлэг):{" "}
            <strong
              className={invoice.patientBalance > 0 ? "text-red-700" : invoice.patientBalance < 0 ? "text-green-700" : "text-gray-900"}
            >
              {formatMoney(invoice.patientBalance)} ₮
            </strong>
          </div>
          {invoice.patientBalance < 0 && (
            <div className="text-right text-green-700">
              (урьдчилгаа / илүү төлөлт)
            </div>
          )}
          {invoice.patientBalance > 0 && (
            <div className="text-right text-red-700">
              (Үйлчлүүлэгчийн төлөх үлдэгдэл)
            </div>
          )}
        </div>
      </div>
    )}
  </div>
</section>

          {/* Billing items */}
<section className="mt-0 p-4 rounded-lg border border-gray-200 bg-white">
  <div className="flex justify-between items-center mb-2">
    <div>
      <h2 className="text-base m-0">
        Үйлчилгээний мөрүүд (Invoice lines)
      </h2>
      <div className="text-xs text-gray-500">
        Доорх жагсаалт нь энэ үзлэгт гүйцэтгэсэн үйлчилгээ, бүтээгдэхүүнийг илэрхийлнэ.
      </div>
    </div>

    {/* ✅ Buttons */}
    <div className="flex gap-[10px]">
      <button
        type="button"
        onClick={handleAddRowFromService}
        className="py-[6px] px-3 rounded-md border border-blue-600 bg-blue-50 text-blue-600 cursor-pointer text-[13px]"
      >
        + Эмчилгээ нэмэх
      </button>

      <button
        type="button"
        onClick={() => {
          setProductModalOpen(true);
          void loadProducts();
        }}
        className="py-[6px] px-3 rounded-md border border-green-600 bg-[#f0fdf4] text-[#166534] cursor-pointer text-[13px]"
      >
        + Бүтээгдэхүүн нэмэх
      </button>
    </div>
  </div>

  {/* everything below stays as you already have it (items table + totals + save button) */}

  
              

            {items.length === 0 && (
              <div className="text-[13px] text-gray-500">
                Нэхэмжлэлийн мөр алга байна. Үйлчилгээ нэмнэ үү.
              </div>
            )}

            {items.length > 0 && (
              <div
  style={{ display: "grid", gridTemplateColumns: "2fr 80px 120px 80px 120px auto" }}
  className="gap-2 items-center py-1 px-2 mt-2 text-[11px] text-gray-500"
>
  <div>Үйлчилгээ / Бүтээгдэхүүн</div>
  <div className="text-center">Тоо хэмжээ</div>
  <div className="text-center">Нэгж үнэ</div>
  <div className="text-center">Шүд</div>
  <div className="text-center">Мөрийн дүн</div>
  <div />
</div>
            )}

            <div className="flex flex-col gap-2 mt-1">
              {items.map((row, index) => {
  const locked = row.source === "ENCOUNTER";
  const lineTotal = (row.unitPrice || 0) * (row.quantity || 0);
  const isImaging = row.itemType === "SERVICE" && row.serviceCategory === "IMAGING";

  // Check if this service has toothScope=ALL from encounter
  const matchingEncounterService = encounter?.encounterServices?.find(
    (es) => es.serviceId === row.serviceId && row.source === "ENCOUNTER"
  );
  const isAllTeeth = matchingEncounterService?.meta?.toothScope === "ALL";

  const diagnosisId = matchingEncounterService?.meta?.diagnosisId;
  const toothCodeFromDiagnosis = diagnosisId != null
    ? (diagnosisById.get(diagnosisId)?.toothCode ?? null)
    : null;

  const imagingMissingAttribution = isImaging && !row.meta?.assignedTo;
  const imagingMissingNurse = isImaging && row.meta?.assignedTo === "NURSE" && !row.meta?.nurseId;

  return (
    <div
      key={index}
      className={`gap-2 rounded-lg border p-2 bg-gray-50 ${imagingMissingAttribution || imagingMissingNurse ? "border-red-300" : "border-gray-200"}`}
    >
      <div
        style={{ display: "grid", gridTemplateColumns: "2fr 80px 120px 80px 120px auto" }}
        className="gap-2 items-center"
      >
      {/* 1 - Name cell */}
      <div className="relative">
        {(() => {
          const q = (svcQueryByRow[index] ?? "").trim().toLowerCase();
          // When q is empty show nothing; when non-empty filter the API results (svcOptions)
          // by the current input for instant feedback while debounce is pending.
          const visibleOptions = q
            ? svcOptions.filter((s) => {
                const name = (s.name || "").toLowerCase();
                const code = (s.code || "").toLowerCase();
                return name.includes(q) || code.includes(q);
              })
            : [];

          return (
            <>
              <input
                type="text"
                value={row.itemType === "SERVICE" && svcOpenRow === index ? (svcQueryByRow[index] ?? "") : row.name}
                disabled={locked}
                onFocus={() => {
                  if (row.itemType !== "SERVICE" || locked) return;
                  setSvcOpenRow(index);
                  setSvcQueryByRow((prev) => ({ ...prev, [index]: "" }));
                }}
                onClick={() => {
                  if (row.itemType !== "SERVICE" || locked) return;
                  setSvcOpenRow(index);
                  setSvcQueryByRow((prev) => ({ ...prev, [index]: "" }));
                }}
                onChange={(e) => {
                  const v = e.target.value;
                  if (row.itemType === "SERVICE") {
                    setSvcQueryByRow((prev) => ({ ...prev, [index]: v }));
                    setSvcOpenRow(index);
                  } else {
                    handleItemChange(index, "name", v);
                  }
                }}
                onKeyDown={(e) => {
                  if (row.itemType !== "SERVICE") return;
                  if (e.key === "Escape") {
                    setSvcOpenRow(null);
                    setSvcQueryByRow((prev) => ({ ...prev, [index]: "" }));
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (visibleOptions.length > 0)
                      setSvcActiveIndex((i) =>
                        Math.min(i + 1, visibleOptions.length - 1)
                      );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (visibleOptions.length > 0)
                      setSvcActiveIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const picked = visibleOptions[svcActiveIndex];
                    if (!picked) return;

                    setItems((prev) =>
                      prev.map((r, i) =>
                        i === index
                          ? {
                              ...r,
                              itemType: "SERVICE",
                              serviceId: picked.id,
                              productId: null,
                              name: picked.name,
                              unitPrice: picked.price,
                              source: r.source ?? "MANUAL",
                              serviceCategory: picked.category ?? null,
                              meta: null,
                            }
                          : r
                      )
                    );

                    // Fetch nurses if IMAGING service selected
                    if (picked.category === "IMAGING" && invoice?.branchId && nurses.length === 0 && !nursesLoading) {
                      setNursesLoading(true);
                      fetch(`/api/users/nurses/today?branchId=${invoice.branchId}`)
                        .then((r) => r.json())
                        .then((data) => { const items2 = data.items || []; setNurses(items2.map((n: any) => ({ id: n.nurseId, name: n.name }))); })
                        .catch(() => {})
                        .finally(() => setNursesLoading(false));
                    }

                    setSvcOpenRow(null);
                    setSvcOptions([]);
                    setSvcQueryByRow((prev) => ({ ...prev, [index]: "" }));
                  }
                }}
                onBlur={() => {
                  setTimeout(
                    () => setSvcOpenRow((cur) => (cur === index ? null : cur)),
                    150
                  );
                }}
                placeholder={
                  row.itemType === "SERVICE"
                    ? "Үйлчилгээний нэр"
                    : "Бүтээгдэхүүний нэр"
                }
                className={`w-full rounded-md border border-gray-300 py-1 px-[6px] text-[13px] mb-1 ${locked ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-text"}`}
              />
              {row.itemType === "SERVICE" &&
                svcOpenRow === index && (
                  <div className="absolute left-0 top-full mt-[6px] w-[360px] bg-white border border-gray-200 rounded-lg z-[100] shadow-lg">
                    <div className="max-h-[220px] overflow-y-auto">
                    {svcLoading && (
                      <div className="p-[10px] text-xs text-gray-500">
                        Хайж байна...
                      </div>
                    )}

                    {!svcLoading &&
                      visibleOptions.map((svc, idx) => (
                        <div
                          key={svc.id}
                          onMouseDown={(ev) => {
                            ev.preventDefault();

                            setItems((prev) =>
                              prev.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      itemType: "SERVICE",
                                      serviceId: svc.id,
                                      productId: null,
                                      name: svc.name,
                                      unitPrice: svc.price,
                                      source: r.source ?? "MANUAL",
                                      serviceCategory: svc.category ?? null,
                                      meta: null,
                                    }
                                  : r
                              )
                            );

                            // Fetch nurses if IMAGING service selected
                            if (svc.category === "IMAGING" && invoice?.branchId && nurses.length === 0 && !nursesLoading) {
                              setNursesLoading(true);
                              fetch(`/api/users/nurses/today?branchId=${invoice.branchId}`)
                                .then((r) => r.json())
                                .then((data) => { const items2 = data.items || []; setNurses(items2.map((n: any) => ({ id: n.nurseId, name: n.name }))); })
                                .catch(() => {})
                                .finally(() => setNursesLoading(false));
                            }

                            setSvcOpenRow(null);
                            setSvcOptions([]);
                            setSvcQueryByRow((prev) => ({
                              ...prev,
                              [index]: "",
                            }));
                          }}
                          className={`py-[10px] px-3 cursor-pointer border-b border-gray-100 ${idx === svcActiveIndex ? "bg-blue-50" : "bg-white"}`}
                        >
                          <div className="font-semibold text-[13px]">
                            {svc.code ? `${svc.code} — ` : ""}
                            {svc.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatMoney(svc.price)} ₮
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </>
          );
        })()}
      </div>

      {/* 2 - Quantity */}
      <input
        type="number"
        min={1}
        value={row.quantity}
        disabled={locked}
        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
        className={`w-full rounded-md border border-gray-300 py-1 px-[6px] text-[13px] text-center ${locked ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-text"}`}
      />

      {/* 3 - Unit Price */}
      <input
        type="number"
        min={0}
        value={row.unitPrice}
        disabled={locked || row.itemType === "SERVICE"}
        onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
        className={`w-full rounded-md border border-gray-300 py-1 px-[6px] text-[13px] text-right ${locked || row.itemType === "SERVICE" ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-text"}`}
      />

      {/* 4 - Teeth Numbers */}
      {isAllTeeth ? (
        <div className="text-[13px] font-medium text-center py-1 px-2 bg-amber-100 rounded text-amber-800">
          Бүх шүд
        </div>
      ) : locked && toothCodeFromDiagnosis ? (
        <div className="text-[13px] text-center py-1 px-2 bg-gray-50 rounded border border-gray-200 text-gray-700">
          {toothCodeFromDiagnosis}
        </div>
      ) : (
        <input
          type="text"
          placeholder="11, 12, 16"
          value={(row.teethNumbers || []).join(", ")}
          disabled={locked}
          onChange={(e) => handleTeethNumbersChange(index, e.target.value)}
          className={`w-[70px] rounded-md border border-gray-300 py-1 px-[6px] text-[13px] text-left ${locked ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-text"}`}
        />
      )}

      {/* 5 - Line Total */}
      <div className="text-[13px] font-semibold text-right">
        {lineTotal.toLocaleString("mn-MN")}₮
      </div>

      {/* 6 - Remove Button */}
      {!locked && (
        <button
          type="button"
          onClick={() => handleRemoveRow(index)}
          className="py-1 px-2 rounded-md border border-red-600 bg-red-50 text-red-700 cursor-pointer text-xs"
        >
          Устгах
        </button>
      )}
      </div>

      {/* IMAGING attribution row */}
      {isImaging && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-3 items-center text-[12px]">
          <span className="text-gray-500 font-medium">🩻 Зураг авах оноох:</span>
          <label className="inline-flex gap-1 items-center cursor-pointer">
            <input
              type="radio"
              name={`billing-assignedTo-${index}`}
              checked={(row.meta?.assignedTo ?? "") === "DOCTOR"}
              onChange={() => handleMetaChange(index, { assignedTo: "DOCTOR" })}
            />
            Эмч
          </label>
          <label className="inline-flex gap-1 items-center cursor-pointer">
            <input
              type="radio"
              name={`billing-assignedTo-${index}`}
              checked={row.meta?.assignedTo === "NURSE"}
              onChange={() => handleMetaChange(index, { assignedTo: "NURSE", nurseId: null })}
            />
            Сувилагч
          </label>

          {row.meta?.assignedTo === "NURSE" && (
            <div className="flex flex-col gap-1">
              {nursesLoading ? (
                <span className="text-gray-400">Ачаалж байна...</span>
              ) : (
                <select
                  value={row.meta?.nurseId ?? ""}
                  onChange={(e) =>
                    handleMetaChange(index, {
                      nurseId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={`py-1 px-2 rounded border text-[12px] ${!row.meta?.nurseId ? "border-red-400" : "border-gray-300"}`}
                >
                  <option value="">— Сувилагч сонгох —</option>
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name ?? `Nurse #${n.id}`}
                    </option>
                  ))}
                </select>
              )}
              {!row.meta?.nurseId && (
                <span className="text-red-500 text-[11px]">Сувилагч сонгоно уу</span>
              )}
            </div>
          )}

          {!row.meta?.assignedTo && (
            <span className="text-red-500">⚠ Гүйцэтгэгч сонгоно уу</span>
          )}
        </div>
      )}
    </div>
  );
})}
            </div>

            <div className="mt-3 flex flex-col gap-1 items-end text-[13px]">
  {/* ✅ Subtotals */}
  <div>
    Үйлчилгээний дүн:{" "}
    <strong>{servicesSubtotal.toLocaleString("mn-MN")}₮</strong>
  </div>
  <div>
    Бүтээгдэхүүний дүн:{" "}
    <strong>{productsSubtotal.toLocaleString("mn-MN")}₮</strong>
  </div>

  {/* ✅ Discount amount (services only) */}
  <div>
    Хөнгөлөлт (зөвхөн үйлчилгээ):{" "}
    <strong className={discountAmount > 0 ? "text-red-700" : undefined}>
      −{discountAmount.toLocaleString("mn-MN")}₮
    </strong>
  </div>

  {/* Existing discount selector */}
  <div>
    Хөнгөлөлт (0 / 5 / 10%):{" "}
    <select
      value={discountPercent}
      onChange={(e) => setDiscountPercent(Number(e.target.value))}
      className="ml-2 py-0.5 px-1 text-[13px]"
    >
      <option value={0}>0%</option>
      <option value={5}>5%</option>
      <option value={10}>10%</option>
    </select>
  </div>

  {/* Total before discount */}
  <div>
    Нийт (хөнгөлөлтгүй):{" "}
    <strong>{totalBeforeDiscount.toLocaleString("mn-MN")}₮</strong>
  </div>

  {/* Final */}
  <div>
    Төлөх дүн:{" "}
    <strong className="text-base">
      {finalAmount.toLocaleString("mn-MN")}₮
    </strong>
  </div>
</div>

            {saveError && (
              <div className="text-red-700 mt-2 text-[13px]">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="text-green-600 mt-2 text-[13px]">
                {saveSuccess}
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveBilling}
                disabled={saving}
                className="py-2 px-4 rounded-md border-none bg-blue-600 text-white cursor-pointer text-sm"
              >
                {saving
                  ? "Нэхэмжлэл хадгалж байна..."
                  : "Нэхэмжлэл хадгалах"}
              </button>
            </div>
          </section>

          {/* Payment section */}
          <BillingPaymentSection invoice={invoice} onUpdated={(updated) => setInvoice(updated)} />

          {/* e-Barimt section */}
          <BillingEbarimtSection invoice={invoice} onUpdated={(updated) => setInvoice(updated)} />

          {/* NEW: Printable / patient paper sections */}
          <section className="mt-4 p-4 rounded-lg border border-gray-200 bg-white">
            <h2 className="text-base m-0 mb-2">
              Хэвлэх боломжтой материалууд
            </h2>
            <div className="text-xs text-gray-500">
              Үйлчлүүлэгчид цаасаар өгөх шаардлагатай мэдээллүүд.
            </div>

           {/* Prescription */}
<div className="mt-3 pt-3 border-t border-gray-200">
  <div className="flex justify-between gap-3">
    <h3 className="m-0 text-sm">Эмийн жор</h3>

    {encounter.prescription?.items?.length ? (
      <button
        type="button"
        onClick={() => window.alert("Жор хэвлэх (дараа нь template оруулна)")}
        className="py-[6px] px-[10px] rounded-md border border-blue-600 bg-blue-50 text-blue-600 cursor-pointer text-xs whitespace-nowrap"
      >
        Хэвлэх
      </button>
    ) : null}
  </div>

  {encounter.prescription?.items?.length ? (
    <div className="mt-2 text-xs">
      <ol className="m-0 pl-[18px]">
        {encounter.prescription.items
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((it) => (
            <li key={it.id} className="mb-1">
              <div>
                <strong>{it.drugName}</strong> — {it.quantityPerTake}x,{" "}
                {it.frequencyPerDay}/өдөр, {it.durationDays} хоног
              </div>
              <div className="text-gray-500">
                Тэмдэглэл: {it.note || "-"}
              </div>
            </li>
          ))}
      </ol>
    </div>
  ) : (
    <div className="mt-[6px] text-xs text-gray-500">
      Энэ үзлэгт эмийн жор байхгүй.
    </div>
  )}
</div>
     

            {/* XRAY */}
<div className="mt-3 pt-3 border-t border-gray-200">
  <h3 className="m-0 text-sm">XRAY зураг</h3>

  {xraysLoading && (
    <div className="mt-[6px] text-xs text-gray-500">
      XRAY ачаалж байна...
    </div>
  )}

  {!xraysLoading && xraysError && (
    <div className="mt-[6px] text-xs text-red-700">
      {xraysError}
    </div>
  )}

  {!xraysLoading && !xraysError && xrays.length === 0 && (
    <div className="mt-[6px] text-xs text-gray-500">
      XRAY зураг хавсаргагдаагүй.
    </div>
  )}

  {!xraysLoading && !xraysError && xrays.length > 0 && (
    <div className="mt-[6px] flex flex-col gap-[6px]">
      {xrays.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between gap-2 py-[6px] px-2 border border-gray-200 rounded-lg bg-gray-50 text-xs"
        >
          <div className="overflow-hidden">
            <a href={m.filePath} target="_blank" rel="noreferrer">
              {m.filePath}
            </a>
            {m.toothCode ? (
              <span className="text-gray-500"> • Шүд: {m.toothCode}</span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => printImage(m.filePath)}
            className="py-1 px-2 rounded-md border border-blue-600 bg-blue-50 text-blue-600 cursor-pointer text-xs whitespace-nowrap"
          >
            Хэвлэх
          </button>
        </div>
      ))}
    </div>
  )}
</div>

            {/* Consent */}
<div className="mt-3 pt-3 border-t border-gray-200">
  <h3 className="m-0 text-sm">Зөвшөөрлийн маягт</h3>

  {consentLoading && (
    <div className="mt-[6px] text-xs text-gray-500">
      Зөвшөөрлийн маягт ачаалж байна...
    </div>
  )}
  {!consentLoading && consentError && (
    <div className="mt-[6px] text-xs text-red-700">
      {consentError}
    </div>
  )}
  {!consentLoading && !consentError && consents.length === 0 && (
    <div className="mt-[6px] text-xs text-gray-500">
      Энэ үзлэгт бөглөгдсөн зөвшөөрлийн маягт байхгүй.
    </div>
  )}

  {!consentLoading && !consentError && consents.length > 0 && (
    <div className="mt-[6px] flex flex-col gap-[6px]">
      {consents.map((c) => (
        <div
          key={`${c.encounterId}-${c.type}`}
          className="flex items-center justify-between gap-2 py-[6px] px-2 border border-gray-200 rounded-lg bg-gray-50 text-xs"
        >
          <div>
            <div>
              <strong>Төрөл:</strong> {formatConsentTypeLabel(c.type)}
            </div>
            
          </div>

          <button
            type="button"
            onClick={() => {
              const url = `/print/consent?encounterId=${c.encounterId}&type=${encodeURIComponent(c.type)}`;
              window.open(url, "_blank", "width=900,height=700,noopener,noreferrer");
            }}
            className="py-1 px-2 rounded-md border border-blue-600 bg-blue-50 text-blue-600 cursor-pointer text-xs whitespace-nowrap"
          >
            Хэвлэх
          </button>
        </div>
      ))}
    </div>
  )}
</div>
          </section>
        </>
      )}
{/* ✅ Product picker modal (rendered once, outside header) */}
      {productModalOpen && (
        <div
          className="fixed inset-0 bg-black/35 flex items-center justify-center z-[80]"
          onClick={() => setProductModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[520px] max-w-[95vw] max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-2xl p-4 text-[13px]"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="m-0 text-[15px]">Бүтээгдэхүүн сонгох</h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="border-none bg-transparent cursor-pointer text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <input
              type="text"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Нэрээр хайх..."
              className="w-full rounded-md border border-gray-300 py-[6px] px-2 text-[13px]"
            />

            {productsLoading && (
              <div className="mt-2 text-xs text-gray-500">Бүтээгдэхүүн ачаалж байна...</div>
            )}
            {productsError && (
              <div className="mt-2 text-xs text-red-700">{productsError}</div>
            )}

            {!productsLoading && !productsError && filteredProducts.length === 0 && (
              <div className="mt-2 text-xs text-gray-500">Хайлтад тохирох бүтээгдэхүүн олдсонгүй.</div>
            )}

            <div className="mt-2 rounded-md border border-gray-200 overflow-hidden">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAddRowFromProduct(p)}
                  className="flex justify-between w-full text-left py-2 px-[10px] border-none border-b border-gray-100 bg-white cursor-pointer text-[13px]"
                >
                  <div className="font-medium">
                    {p.name}
                    {p.sku ? <span className="ml-[6px] text-gray-500">({p.sku})</span> : null}
                  </div>
                  <div className="text-gray-500">{Number(p.price || 0).toLocaleString("mn-MN")}₮</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Service picker modal - removed in favor of inline autocomplete */}
    </main>
  );
}
