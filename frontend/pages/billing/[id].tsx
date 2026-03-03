import React, { useCallback, useEffect, useMemo, useState, useMemo as useReactMemo } from "react";
import { useRouter } from "next/router";
import { QRCodeSVG } from "qrcode.react";

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

type Service = { id: number; code?: string | null; name: string; price: number };

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
};

type Payment = { id: number; amount: number; method: string; timestamp: string };

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

type Encounter = {
  id: number;
  visitDate: string;
  notes?: string | null;
  patientBook: PatientBook;
  doctor: Doctor | null;
  prescription?: Prescription | null;
  encounterServices?: EncounterService[];
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
    return d.toLocaleString("mn-MN");
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
    <section
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      <h2 style={{ fontSize: 16, margin: 0, marginBottom: 8 }}>
        Төлбөр бүртгэх
      </h2>

      {!hasRealInvoice && (
        <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>
          Нэхэмжлэлийн мөрүүдийг хадгалсны дараа төлбөр бүртгэх боломжтой.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {/* ── Split payment controls (only when marker service present) ── */}
        {hasMarker && hasRealInvoice && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #fbbf24",
              background: "#fffbeb",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 4,
            }}
          >
            {/* Checkbox: close old balance */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              <label htmlFor="closeOldBalance" style={{ fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                Төлбөрийн үлдэгдлийг дуусгах{" "}
                <span style={{ color: "#b45309" }}>
                  (өмнөх үлдэгдэл: {formatMoney(oldBalance)} ₮)
                </span>
              </label>
            </div>

            {/* Breakdown when closeOldBalance is checked */}
            {closeOldBalance && (
              <div
                style={{
                  marginLeft: 26,
                  fontSize: 13,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  color: "#374151",
                }}
              >
                <div>
                  Өмнөх үлдэгдэлд орох:{" "}
                  <strong style={{ color: "#b45309" }}>{formatMoney(amountToOld)} ₮</strong>
                </div>
                <div>
                  Өнөөдрийн үйлчилгээ рүү орох:{" "}
                  <strong style={{ color: "#15803d" }}>{formatMoney(amountToCurrent)} ₮</strong>
                </div>
              </div>
            )}

            {/* Checkbox: split payment (only enabled when Y > 0) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                style={{
                  fontSize: 13,
                  cursor: splitPaymentEnabled ? "pointer" : "not-allowed",
                  color: splitPaymentEnabled ? "#111827" : "#9ca3af",
                  fontWeight: 500,
                }}
              >
                Хувааж төлөх{" "}
                {!splitPaymentEnabled && closeOldBalance && (
                  <span style={{ fontWeight: 400 }}>(өнөөдрийн үйлчилгээ рүү орох дүн 0)</span>
                )}
              </label>
            </div>

            {/* Per-service allocation inputs */}
            {splitPayment && splitPaymentEnabled && (
              <div style={{ marginLeft: 26 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                  Нийт {formatMoney(amountToCurrent)} ₮-г үйлчилгээнүүдэд хувааж оруулна уу:
                </div>
                {invoice.items.map((item) => {
                  if (item.itemType !== "SERVICE") {
                    return (
                      <div
                        key={item.id ?? `p-${item.productId}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                          fontSize: 13,
                          color: "#9ca3af",
                        }}
                      >
                        <div style={{ flex: 1 }}>{item.name}</div>
                        <div style={{ width: 90, textAlign: "right" }}>—</div>
                        <span style={{ fontSize: 12 }}>₮</span>
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
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        {item.name}{" "}
                        <span style={{ color: "#6b7280", fontSize: 12 }}>
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
                        style={{
                          width: 90,
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          padding: "3px 6px",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      />
                      <span style={{ fontSize: 12 }}>₮</span>
                    </div>
                  );
                })}
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    color:
                      Math.abs(splitAllocTotal - amountToCurrent) <= PAYMENT_ALLOCATION_TOLERANCE
                        ? "#15803d"
                        : "#b91c1c",
                  }}
                >
                  Нийлбэр: {formatMoney(splitAllocTotal)} ₮ / {formatMoney(amountToCurrent)} ₮
                </div>
              </div>
            )}
          </div>
        )}

        {loadingMethods ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Төлбөрийн аргууд ачаалж байна...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {paymentMethods.map((m) => {
              const checked = !!enabled[m.key];
              const value = amounts[m.key] ?? "";
              const providers = m.providers || [];
              return (
                <div
                  key={m.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      id={`pay-${m.key}`}
                      checked={checked}
                      onChange={(e) => handleToggle(m.key, e.target.checked)}
                    />
                    <label
                      htmlFor={`pay-${m.key}`}
                      style={{
                        minWidth: 180,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>{m.label}</span>
                  </label>
                </div>

                {checked && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginLeft: 26,
                    }}
                  >
                    {/* TRANSFER: bank selector */}
                    {m.key === "TRANSFER" && (
  <input
    type="text"
    value={transferNote}
    onChange={(e) => setTransferNote(e.target.value)}
    placeholder="Тайлбар (заавал биш)"
    style={{
      width: 200,
      borderRadius: 6,
      border: "1px solid #d1d5db",
      padding: "4px 6px",
      fontSize: 12,
    }}
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
                        style={{
                          minWidth: 200,
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          padding: "4px 6px",
                          fontSize: 13,
                        }}
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
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      flex: 1,
    }}
  >
    {appRows.map((row, idx) => (
      <div
        key={idx}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
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
          style={{
            minWidth: 160,
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "4px 6px",
            fontSize: 12,
          }}
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
          style={{
            width: 100,
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "4px 6px",
            fontSize: 12,
            textAlign: "right",
          }}
        />
        <span style={{ fontSize: 12 }}>₮</span>

        {appRows.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setAppRows((prev) => prev.filter((_, i) => i !== idx))
            }
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid #dc2626",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 11,
              cursor: "pointer",
            }}
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
      style={{
        alignSelf: "flex-start",
        marginTop: 2,
        padding: "2px 6px",
        borderRadius: 999,
        border: "1px solid #2563eb",
        background: "#eff6ff",
        color: "#2563eb",
        fontSize: 11,
        cursor: "pointer",
      }}
    >
      + Нэмэх
    </button>
  </div>
)}

                    {m.key === "VOUCHER" && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}
  >
    <select
      value={voucherType}
      onChange={(e) =>
        setVoucherType(
          e.target.value as "MARKETING" | "GIFT" | ""
        )
      }
      style={{
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "4px 6px",
        fontSize: 12,
      }}
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
      style={{
        width: 120,
        borderRadius: 6,
        border: "1px solid #d1d5db",
        padding: "4px 6px",
        fontSize: 12,
      }}
    />

    <button
      type="button"
      onClick={handleVerifyVoucherCode}
      style={{
        padding: "4px 8px",
        borderRadius: 4,
        border: "1px solid #2563eb",
        background: "#eff6ff",
        color: "#2563eb",
        fontSize: 11,
        cursor: "pointer",
      }}
    >
      Шалгах
    </button>

    {voucherMaxAmount != null && (
      <span
        style={{
          fontSize: 12,
          color: "#16a34a",
          marginLeft: 4,
        }}
      >
        Дээд дүн: {formatMoney(voucherMaxAmount)} ₮
      </span>
    )}
  </div>
)}

                    {m.key === "BARTER" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          type="text"
                          value={barterCode}
                          onChange={(e) =>
                            setBarterCode(e.target.value)
                          }
                          placeholder="Бартерын код"
                          style={{
                            width: 140,
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                            fontSize: 12,
                          }}
                        />
                      </div>
                    )}

                    {m.key === "EMPLOYEE_BENEFIT" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          type="text"
                          value={employeeCode}
                          onChange={(e) =>
                            setEmployeeCode(e.target.value)
                          }
                          placeholder="Ажилтны код"
                          style={{
                            width: 140,
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                            fontSize: 12,
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleVerifyEmployeeCode}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid #2563eb",
                            background: "#eff6ff",
                            color: "#2563eb",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Шалгах
                        </button>
                        {employeeRemaining != null && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#16a34a",
                              marginLeft: 4,
                            }}
                          >
                            Үлдэгдэл:{" "}
                            {formatMoney(employeeRemaining)} ₮
                          </span>
                        )}
                      </div>
                    )}

                    {/* OTHER: optional note field */}
                    {m.key === "OTHER" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <input
                          type="text"
                          value={otherNote}
                          onChange={(e) => setOtherNote(e.target.value)}
                          placeholder="Тайлбар (заавал биш)"
                          style={{
                            width: 200,
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                            fontSize: 12,
                          }}
                        />
                      </div>
                    )}

                    {m.key === "WALLET" && (
                      <div
                        style={{
                          fontSize: 12,
                          color:
                            walletAvailable > 0 ? "#16a34a" : "#6b7280",
                        }}
                      >
                        Хэтэвчийн боломжит үлдэгдэл:{" "}
                        <strong>
                          {formatMoney(walletAvailable)} ₮
                        </strong>
                      </div>
                    )}

                    {/* QPAY: Generate QR button */}
                    {m.key === "QPAY" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <button
                          type="button"
                          onClick={handleGenerateQPayQR}
                          disabled={qpayGenerating}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid #2563eb",
                            background: "#eff6ff",
                            color: "#2563eb",
                            fontSize: 11,
                            cursor: qpayGenerating ? "not-allowed" : "pointer",
                          }}
                        >
                          {qpayGenerating ? "Үүсгэж байна..." : "QR үүсгэх"}
                        </button>
                      </div>
                    )}

                                        {m.key !== "APPLICATION" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          flex: 1,
                        }}
                      >
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={(e) =>
                            handleAmountChange(m.key, e.target.value)
                          }
                          placeholder="0"
                          style={{
                            flex: 1,
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 13,
                            textAlign: "right",
                          }}
                        />
                        <span style={{ fontSize: 12 }}>₮</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        <div
          style={{
            fontSize: 12,
            color: "#4b5563",
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
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
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              padding: 12,
              marginTop: 12,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 4 }}>
              ⚠️ Ариутгалын тохиргоо дутуу байна
            </div>
            <div style={{ color: "#78350f", marginBottom: 8 }}>
              Энэ үзлэгт {unresolvedMismatches.length} ширхэг ариутгалын багажийн зөрүү шийдвэрлэгдээгүй байна. 
              Төлбөр батлах боломжгүй.
            </div>
            <a
              href="/sterilization/mismatches"
              style={{
                color: "#1e40af",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Зөрүү шийдвэрлэх хуудас руу шилжих →
            </a>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 4 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ fontSize: 13, color: "#16a34a", marginTop: 4 }}>
            {success}
          </div>
        )}

        <div
          style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}
        >
          <button
            type="submit"
            disabled={submitting || !hasRealInvoice || unresolvedMismatches.length > 0}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: hasRealInvoice && unresolvedMismatches.length === 0 ? "#16a34a" : "#9ca3af",
              color: "#ffffff",
              cursor: hasRealInvoice && unresolvedMismatches.length === 0 ? "pointer" : "not-allowed",
              fontSize: 14,
            }}
          >
            {submitting ? "Төлбөр хадгалж байна..." : "Төлбөр бүртгэх"}
          </button>
        </div>
      </form>

      {invoice.payments && invoice.payments.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Бүртгэгдсэн төлбөрүүд
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {invoice.payments.map((p) => (
              <li key={p.id}>
                {formatDateTime(p.timestamp)} — {p.method} —{" "}
                {formatMoney(p.amount)} ₮
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* QPay QR Modal */}
      {qpayModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 90,
          }}
          onClick={handleCloseQPayModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480,
              maxWidth: "95vw",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 8,
              boxShadow: "0 14px 40px rgba(0,0,0,0.3)",
              padding: 20,
              fontSize: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                QPay Төлбөр
              </h3>
              <button
                type="button"
                onClick={handleCloseQPayModal}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 24,
                  lineHeight: 1,
                  color: "#6b7280",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {qpayError && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 10,
                  borderRadius: 6,
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 13,
                }}
              >
                {qpayError}
              </div>
            )}

            {qpayPaidAmount ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 6,
                  background: "#f0fdf4",
                  color: "#15803d",
                  fontSize: 14,
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                ✓ Төлбөр амжилттай төлөгдлөө: {formatMoney(qpayPaidAmount)} ₮
              </div>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 6,
                    background: "#eff6ff",
                    color: "#1e40af",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  {qpayPolling
                    ? "Төлбөр хүлээж байна... (3 секунд тутамд шалгана)"
                    : "QR код уншуулах эсвэл холбоос дарна уу"}
                </div>

                {qpayQrImage && (
                  <div
                    style={{
                      marginBottom: 16,
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <img
                      src={qpayQrImage}
                      alt="QPay QR Code"
                      style={{
                        maxWidth: 240,
                        height: "auto",
                        border: "2px solid #e5e7eb",
                        borderRadius: 8,
                      }}
                    />
                  </div>
                )}

                {qpayQrText && (
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 4,
                      }}
                    >
                      QR текст:
                    </div>
                    <div
                      style={{
                        padding: 8,
                        borderRadius: 6,
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        fontSize: 11,
                        wordBreak: "break-all",
                        fontFamily: "monospace",
                      }}
                    >
                      {qpayQrText}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(qpayQrText);
                        setSuccess("QR текст хуулагдлаа");
                      }}
                      style={{
                        marginTop: 6,
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid #2563eb",
                        background: "#eff6ff",
                        color: "#2563eb",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Хуулах
                    </button>
                  </div>
                )}

                {qpayUrls && qpayUrls.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                      }}
                    >
                      Апп-аар төлөх:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {qpayUrls.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: "1px solid #2563eb",
                            background: "#eff6ff",
                            color: "#2563eb",
                            textDecoration: "none",
                            fontSize: 12,
                            textAlign: "center",
                          }}
                        >
                          Холбоос #{idx + 1} нээх
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={handleCloseQPayModal}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  fontSize: 13,
                  cursor: "pointer",
                }}
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
    <section
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      <h2 style={{ fontSize: 16, margin: 0, marginBottom: 8 }}>
        e-Barimt
      </h2>

      {!isPaid && (
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          Нэхэмжлэл бүрэн төлөгдсөний дараа e-Barimt мэдээлэл оруулах боломжтой.
        </div>
      )}

      {isLocked && (
        <div
          style={{
            fontSize: 13,
            color: "#92400e",
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 6,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          e-Barimt баримт аль хэдийн гаргасан тул худалдан авагчийн мэдээллийг өөрчлөх боломжгүй.
        </div>
      )}

      {isLocked && invoice.ebarimtReceipt?.status === "SUCCESS" && !receipt && (
        <div
          style={{
            marginBottom: 8,
            padding: "10px 14px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>✅ e-Barimt гаргасан</div>
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
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: disabled ? 0.6 : 1,
          pointerEvents: disabled ? "none" : undefined,
        }}
      >
        {/* Buyer type selector */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <label style={{ fontSize: 13, fontWeight: 500, minWidth: 120 }}>
            Худалдан авагч:
          </label>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
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
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 13, fontWeight: 500, minWidth: 120 }}>
              ТТД (TIN):
            </label>
            <input
              type="text"
              value={buyerTin}
              onChange={(e) => setBuyerTin(e.target.value.replace(/\D/g, ""))}
              placeholder="11 эсвэл 14 оронтой тоо"
              disabled={disabled}
              maxLength={14}
              style={{
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
                width: 200,
              }}
            />
          </div>
        )}

        {/* Save & Issue button */}
        {invoice.id != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || saving}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: disabled || saving ? "#9ca3af" : "#2563eb",
                color: "#ffffff",
                cursor: disabled || saving ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {saving ? "e-Barimt гаргаж байна..." : "e-Barimt гаргах"}
            </button>
            {success && (
              <span style={{ fontSize: 13, color: "#15803d" }}>{success}</span>
            )}
          </div>
        )}

        {(issuedDdtd || issuedPrintedAtText) && !receipt && (
          <div
            style={{
              fontSize: 13,
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 6,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {issuedDdtd && (
              <div>
                <span style={{ fontWeight: 500 }}>Баримтын дугаар (ДДТД): </span>
                <span style={{ fontFamily: "monospace" }}>{issuedDdtd}</span>
              </div>
            )}
            {issuedPrintedAtText && (
              <div>
                <span style={{ fontWeight: 500 }}>Огноо: </span>
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
            <div style={{ width: 215, padding: "8px 6px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.4 }}>
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://mdent.cloud/clinic-logo.png" alt="Clinic logo" style={{ width: 90, height: "auto" }} />
              </div>
            
              <div>Утас: 7715-1551</div>
              <div>И-мэйл: info@monfamily.mn</div>
              <hr style={{ margin: "4px 0" }} />
              <div>ТТД: 6948472</div>
              {receipt.id && <div>ДДТД: {receipt.id}</div>}
              {(invoice.ebarimtReceipt?.ddtd) && !receipt.id && <div>ДДТД: {invoice.ebarimtReceipt.ddtd}</div>}
              {receipt.date && <div>Огноо: {receipt.date}</div>}
              {invoice.ebarimtReceipt?.id != null && <div>Дугаар: {invoice.ebarimtReceipt.id}</div>}
              {invoice.patientOvog && <div>Овог: {invoice.patientOvog}</div>}
              {invoice.patientName && <div>Нэр: {invoice.patientName}</div>}
              {invoice.patientRegNo && <div>РД: {invoice.patientRegNo}</div>}
              <hr style={{ margin: "4px 0" }} />
              <div style={{ fontWeight: 700, marginBottom: 2 }}>НӨАТ-оос чөлөөлөгдөх бараа</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingRight: 2 }}>ҮЙЛЧИЛГЭЭ</th>
                    <th style={{ textAlign: "right", paddingRight: 2 }}>ТОО</th>
                    <th style={{ textAlign: "right" }}>НИЙТ</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it, idx) => (
                    <tr key={it.id ?? idx}>
                      <td style={{ paddingRight: 2, wordBreak: "break-word" }}>{it.name}</td>
                      <td style={{ textAlign: "right", paddingRight: 2 }}>{it.quantity}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr style={{ margin: "4px 0" }} />
              {receipt.qrData && (
                <div style={{ textAlign: "center", margin: "6px 0" }}>
                  <QRCodeSVG value={receipt.qrData} size={140} />
                </div>
              )}
              {receipt.lottery && <div>Сугалаа: {receipt.lottery}</div>}
              <div style={{ fontWeight: 700, marginTop: 2 }}>
                Нийт дүн: {formatMoney(receipt.totalAmount ?? invoice.finalAmount)}₮
              </div>
            </div>
          </div>
          {/* Inline receipt preview card */}
          <div
            style={{
              marginTop: 8,
              padding: "12px 16px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 13,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, textAlign: "center", marginBottom: 4 }}>
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
              <div style={{ marginTop: 8, textAlign: "center" }}>
                <QRCodeSVG value={receipt.qrData} size={120} />
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                🖨️ e-Barimt хэвлэх
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 8 }}>{error}</div>
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

 // --- NEW: inline service autocomplete (per-row) ---
const [svcOpenRow, setSvcOpenRow] = useState<number | null>(null);
const [svcQueryByRow, setSvcQueryByRow] = useState<Record<number, string>>({});
const [svcLoading, setSvcLoading] = useState(false);
const [svcOptions, setSvcOptions] = useState<Service[]>([]);
const [svcActiveIndex, setSvcActiveIndex] = useState(0);
const searchServices = useCallback(
  async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setSvcOptions([]);
      return;
    }

    const branchId = encounter?.patientBook?.patient?.branch?.id;

    setSvcLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("onlyActive", "true");
      params.set("limit", "20");
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

  // Service selector state
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceModalRowIndex, setServiceModalRowIndex] = useState<number | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");

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
    setSaving(true);

    try {
      const payload = {
        discountPercent,
        items: items
          .filter((r) => r.serviceId || r.productId || r.name.trim())
          .map((r) => ({
            id: r.id,
            itemType: r.itemType,
            serviceId: r.itemType === "SERVICE" ? r.serviceId : null,
            productId: r.itemType === "PRODUCT" ? r.productId : null,
            name: r.name,
            unitPrice: r.unitPrice,
            quantity: r.quantity,
            teethNumbers: r.teethNumbers,
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

  // ---- Service modal logic ----
  const loadServices = async () => {
    if (services.length > 0 || servicesLoading) return;
    setServicesLoading(true);
    setServicesError("");
    try {
      const res = await fetch(`/api/services`);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error((data && data.error) || "Үйлчилгээний жагсаалт ачаалахад алдаа гарлаа.");
      }

      const list: Service[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any).services)
        ? (data as any).services
        : [];

      setServices(list);
    } catch (err: any) {
      console.error("Failed to load services:", err);
      setServicesError(err.message || "Үйлчилгээний жагсаалт ачаалахад алдаа гарлаа.");
    } finally {
      setServicesLoading(false);
    }
  };

  const openServiceModalForRow = (index: number) => {
    setServiceModalRowIndex(index);
    setServiceModalOpen(true);
    setServiceQuery("");
    void loadServices();
  };

  const closeServiceModal = () => {
    setServiceModalOpen(false);
    setServiceModalRowIndex(null);
    setServiceQuery("");
  };

  const handleSelectServiceForRow = (svc: Service) => {
    if (serviceModalRowIndex == null) return;
    setItems((prev) =>
      prev.map((row, i) =>
        i === serviceModalRowIndex
          ? {
              ...row,
              itemType: "SERVICE",
              serviceId: svc.id,
              productId: null,
              name: svc.name,
              unitPrice: svc.price,
            }
          : row
      )
    );
    closeServiceModal();
  };

  const filteredServices = useReactMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const code = (s.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [services, serviceQuery]);

  const filteredProducts = useReactMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [products, productQuery]);

  if (!encounterId || Number.isNaN(encounterId)) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1>Нэхэмжлэлийн хуудас</h1>
        <div style={{ color: "red" }}>Encounter ID буруу байна.</div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Нэхэмжлэлийн хуудас (Encounter ID: {encounterId})</h1>

     {loading && <div>Ачаалж байна...</div>}
      {!loading && loadError && <div style={{ color: "red", marginBottom: 12 }}>{loadError}</div>}

      {encounter && invoice && (
        <>
          {/* Header / Encounter summary */}
<section
  style={{
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
    }}
  >
    {/* LEFT: existing patient / encounter info */}
    <div style={{ fontSize: 16, lineHeight: 1.5 }}>
      <div style={{ marginBottom: 4 }}>
        <strong>Үйлчлүүлэгч:</strong>{" "}
        {formatPatientName(encounter.patientBook.patient)} (Карт:{" "}
        {encounter.patientBook.bookNumber})
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Салбар:</strong>{" "}
        {encounter.patientBook.patient.branch
          ? encounter.patientBook.patient.branch.name
          : "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Эмч:</strong> {formatDoctorName(encounter.doctor)}
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Огноо:</strong> {formatDateTime(encounter.visitDate)}
      </div>
      {encounter.notes && (
        <div style={{ marginTop: 4 }}>
          <strong>Үзлэгийн тэмдэглэл:</strong> {encounter.notes}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 13 }}>
        <strong>Нэхэмжлэл:</strong>{" "}
        {invoice.id
          ? `#${invoice.id} – ${invoice.finalAmount.toLocaleString(
              "mn-MN"
            )}₮ (${invoice.status})`
          : "Одоогоор хадгалагдсан нэхэмжлэл байхгүй (түр санал болгосон тооцоо)."}
        {invoice.hasEBarimt && " • e-Barimt хэвлэгдсэн"}
      </div>
      {invoice.paidTotal != null && (
        <div style={{ marginTop: 4, fontSize: 13 }}>
          Нийт төлсөн:{" "}
          <strong>{formatMoney(invoice.paidTotal)} ₮</strong> • Үлдэгдэл:{" "}
          <strong>{formatMoney(invoice.unpaidAmount || 0)} ₮</strong>
        </div>
      )}
    </div>

    {/* RIGHT: patient balance summary */}
    {invoice.patientBalance != null && (
      <div
        style={{
          minWidth: 260,
          padding: 10,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontSize: 13,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 4,
            textAlign: "right",
          }}
        >
          Санхүүгийн үлдэгдэл
        </div>
        <div style={{ textAlign: "right" }}>
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
              style={{
                color:
                  invoice.patientBalance > 0
                    ? "#b91c1c" // owes
                    : invoice.patientBalance < 0
                    ? "#15803d" // credit
                    : "#111827",
              }}
            >
              {formatMoney(invoice.patientBalance)} ₮
            </strong>
          </div>
          {invoice.patientBalance < 0 && (
            <div style={{ textAlign: "right", color: "#15803d" }}>
              (урьдчилгаа / илүү төлөлт)
            </div>
          )}
          {invoice.patientBalance > 0 && (
            <div style={{ textAlign: "right", color: "#b91c1c" }}>
              (Үйлчлүүлэгчийн төлөх үлдэгдэл)
            </div>
          )}
        </div>
      </div>
    )}
  </div>
</section>

          {/* Billing items */}
<section
  style={{
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    }}
  >
    <div>
      <h2 style={{ fontSize: 16, margin: 0 }}>
        Үйлчилгээний мөрүүд (Invoice lines)
      </h2>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Доорх жагсаалт нь энэ үзлэгт гүйцэтгэсэн үйлчилгээ, бүтээгдэхүүнийг илэрхийлнэ.
      </div>
    </div>

    {/* ✅ Buttons */}
    <div style={{ display: "flex", gap: 10 }}>
      <button
        type="button"
        onClick={handleAddRowFromService}
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #2563eb",
          background: "#eff6ff",
          color: "#2563eb",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        + Эмчилгээ нэмэх
      </button>

      <button
        type="button"
        onClick={() => {
          setProductModalOpen(true);
          void loadProducts();
        }}
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #16a34a",
          background: "#f0fdf4",
          color: "#166534",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        + Бүтээгдэхүүн нэмэх
      </button>
    </div>
  </div>

  {/* everything below stays as you already have it (items table + totals + save button) */}

  
              

            {items.length === 0 && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Нэхэмжлэлийн мөр алга байна. Үйлчилгээ нэмнэ үү.
              </div>
            )}

            {items.length > 0 && (
              <div
  style={{
    display: "grid",
    gridTemplateColumns: "2fr 80px 120px 80px 120px auto", // 6 columns!
    gap: 8,
    alignItems: "center",
    padding: "4px 8px",
    marginTop: 8,
    fontSize: 11,
    color: "#6b7280",
  }}
>
  <div>Үйлчилгээ / Бүтээгдэхүүн</div>
  <div style={{ textAlign: "center" }}>Тоо хэмжээ</div>
  <div style={{ textAlign: "center" }}>Нэгж үнэ</div>
  <div style={{ textAlign: "center" }}>Шүд</div>
  <div style={{ textAlign: "center" }}>Мөрийн дүн</div>
  <div />
</div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 4,
              }}
            >
              {items.map((row, index) => {
  const locked = row.source === "ENCOUNTER";
  const lineTotal = (row.unitPrice || 0) * (row.quantity || 0);

  // Check if this service has toothScope=ALL from encounter
  const matchingEncounterService = encounter?.encounterServices?.find(
    (es) => es.serviceId === row.serviceId && row.source === "ENCOUNTER"
  );
  const isAllTeeth = matchingEncounterService?.meta?.toothScope === "ALL";

  return (
    <div
      key={index}
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 80px 120px 80px 120px auto",
        gap: 8,
        alignItems: "center",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        padding: 8,
        background: "#f9fafb",
      }}
    >
      {/* 1 - Name cell */}
      <div style={{ position: "relative" }}>
        {(() => {
          const q = (svcQueryByRow[index] ?? "").trim().toLowerCase();
          const visibleOptions = q
            ? svcOptions.filter((s) => {
                const name = (s.name || "").toLowerCase();
                const code = (s.code || "").toLowerCase();
                return name.includes(q) || code.includes(q);
              })
            : svcOptions;

          return (
            <>
              <input
                type="text"
                value={row.name}
                disabled={locked}
                onFocus={() => {
                  if (row.itemType !== "SERVICE" || locked) return;
                  setSvcOpenRow(index);
                  setSvcQueryByRow((prev) => ({
                    ...prev,
                    [index]: row.name || prev[index] || "",
                  }));
                }}
                onChange={(e) => {
                  const v = e.target.value;
                  handleItemChange(index, "name", v);

                  if (row.itemType !== "SERVICE" || locked) return;
                  setSvcQueryByRow((prev) => ({ ...prev, [index]: v }));
                  setSvcOpenRow(index);
                }}
                onBlur={() => {
                  setTimeout(
                    () => setSvcOpenRow((cur) => (cur === index ? null : cur)),
                    150
                  );
                }}
                onKeyDown={(e) => {
                  if (svcOpenRow !== index) return;

                  if (e.key === "Escape") {
                    setSvcOpenRow(null);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSvcActiveIndex((i) =>
                      Math.min(i + 1, visibleOptions.length - 1)
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
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
                            }
                          : r
                      )
                    );

                    setSvcOpenRow(null);
                    setSvcOptions([]);
                    setSvcQueryByRow((prev) => ({ ...prev, [index]: "" }));
                  }
                }}
                placeholder={
                  row.itemType === "SERVICE"
                    ? "Үйлчилгээний нэр"
                    : "Бүтээгдэхүүний нэр"
                }
                style={{
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "4px 6px",
                  fontSize: 13,
                  marginBottom: 4,
                  background: locked ? "#f3f4f6" : "#ffffff",
                  cursor: locked ? "not-allowed" : "text",
                }}
              />

              {row.itemType === "SERVICE" &&
                svcOpenRow === index &&
                (svcLoading || visibleOptions.length > 0) && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "100%",
                      marginTop: 6,
                      width: 360,
                      maxHeight: 260,
                      overflowY: "auto",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      zIndex: 100,
                      boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                    }}
                  >
                    {svcLoading && (
                      <div
                        style={{
                          padding: 10,
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
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
                                    }
                                  : r
                              )
                            );

                            setSvcOpenRow(null);
                            setSvcOptions([]);
                            setSvcQueryByRow((prev) => ({
                              ...prev,
                              [index]: "",
                            }));
                          }}
                          style={{
                            padding: "10px 12px",
                            cursor: "pointer",
                            background:
                              idx === svcActiveIndex ? "#eff6ff" : "#ffffff",
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {svc.code ? `${svc.code} — ` : ""}
                            {svc.name}
                          </div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            {formatMoney(svc.price)} ₮
                          </div>
                        </div>
                      ))}
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
        style={{
          width: "100%",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          padding: "4px 6px",
          fontSize: 13,
          textAlign: "center",
          background: locked ? "#f3f4f6" : "#ffffff",
          cursor: locked ? "not-allowed" : "text",
        }}
      />

      {/* 3 - Unit Price */}
      <input
        type="number"
        min={0}
        value={row.unitPrice}
        disabled={locked}
        onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
        style={{
          width: "100%",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          padding: "4px 6px",
          fontSize: 13,
          textAlign: "right",
          background: locked ? "#f3f4f6" : "#ffffff",
          cursor: locked ? "not-allowed" : "text",
        }}
      />

      {/* 4 - Teeth Numbers */}
      {isAllTeeth ? (
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
            padding: "4px 6px",
            background: "#fef3c7",
            borderRadius: 6,
            color: "#92400e",
          }}
        >
          Бүх шүд
        </div>
      ) : (
        <input
          type="text"
          placeholder="11, 12, 16"
          value={(row.teethNumbers || []).join(", ")}
          disabled={locked}
          onChange={(e) => handleTeethNumbersChange(index, e.target.value)}
          style={{
            width: "70px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: "4px 6px",
            fontSize: 13,
            textAlign: "left",
            background: locked ? "#f3f4f6" : "#ffffff",
            cursor: locked ? "not-allowed" : "text",
          }}
        />
      )}

      {/* 5 - Line Total */}
      <div style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
        {lineTotal.toLocaleString("mn-MN")}₮
      </div>

      {/* 6 - Remove Button */}
      {!locked && (
        <button
          type="button"
          onClick={() => handleRemoveRow(index)}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #dc2626",
            background: "#fef2f2",
            color: "#b91c1c",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Устгах
        </button>
      )}
    </div>
  );
})}
            </div>

            <div
  style={{
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "flex-end",
    fontSize: 13,
  }}
>
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
    <strong style={{ color: discountAmount > 0 ? "#b91c1c" : undefined }}>
      −{discountAmount.toLocaleString("mn-MN")}₮
    </strong>
  </div>

  {/* Existing discount selector */}
  <div>
    Хөнгөлөлт (0 / 5 / 10%):{" "}
    <select
      value={discountPercent}
      onChange={(e) => setDiscountPercent(Number(e.target.value))}
      style={{
        marginLeft: 8,
        padding: "2px 4px",
        fontSize: 13,
      }}
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
    <strong style={{ fontSize: 16 }}>
      {finalAmount.toLocaleString("mn-MN")}₮
    </strong>
  </div>
</div>

            {saveError && (
              <div style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div style={{ color: "#16a34a", marginTop: 8, fontSize: 13 }}>
                {saveSuccess}
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={handleSaveBilling}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 14,
                }}
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
          <section
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0, marginBottom: 8 }}>
              Хэвлэх боломжтой материалууд
            </h2>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Үйлчлүүлэгчид цаасаар өгөх шаардлагатай мэдээллүүд.
            </div>

           {/* Prescription */}
<div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
    <h3 style={{ margin: 0, fontSize: 14 }}>Эмийн жор</h3>

    {encounter.prescription?.items?.length ? (
      <button
        type="button"
        onClick={() => window.alert("Жор хэвлэх (дараа нь template оруулна)")}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #2563eb",
          background: "#eff6ff",
          color: "#2563eb",
          cursor: "pointer",
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        Хэвлэх
      </button>
    ) : null}
  </div>

  {encounter.prescription?.items?.length ? (
    <div style={{ marginTop: 8, fontSize: 12 }}>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {encounter.prescription.items
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((it) => (
            <li key={it.id} style={{ marginBottom: 4 }}>
              <div>
                <strong>{it.drugName}</strong> — {it.quantityPerTake}x,{" "}
                {it.frequencyPerDay}/өдөр, {it.durationDays} хоног
              </div>
              <div style={{ color: "#6b7280" }}>
                Тэмдэглэл: {it.note || "-"}
              </div>
            </li>
          ))}
      </ol>
    </div>
  ) : (
    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
      Энэ үзлэгт эмийн жор байхгүй.
    </div>
  )}
</div>
     

            {/* XRAY */}
<div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
  <h3 style={{ margin: 0, fontSize: 14 }}>XRAY зураг</h3>

  {xraysLoading && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
      XRAY ачаалж байна...
    </div>
  )}

  {!xraysLoading && xraysError && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
      {xraysError}
    </div>
  )}

  {!xraysLoading && !xraysError && xrays.length === 0 && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
      XRAY зураг хавсаргагдаагүй.
    </div>
  )}

  {!xraysLoading && !xraysError && xrays.length > 0 && (
    <div
      style={{
        marginTop: 6,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {xrays.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "6px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f9fafb",
            fontSize: 12,
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <a href={m.filePath} target="_blank" rel="noreferrer">
              {m.filePath}
            </a>
            {m.toothCode ? (
              <span style={{ color: "#6b7280" }}> • Шүд: {m.toothCode}</span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() =>
              window.alert(`XRAY хэвлэх: ${m.filePath} (дараа нь template)`)
            }
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#2563eb",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            Хэвлэх
          </button>
        </div>
      ))}
    </div>
  )}
</div>

            {/* Consent */}
<div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
  <h3 style={{ margin: 0, fontSize: 14 }}>Зөвшөөрлийн маягт</h3>

  {consentLoading && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
      Зөвшөөрлийн маягт ачаалж байна...
    </div>
  )}
  {!consentLoading && consentError && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>
      {consentError}
    </div>
  )}
  {!consentLoading && !consentError && consents.length === 0 && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
      Энэ үзлэгт бөглөгдсөн зөвшөөрлийн маягт байхгүй.
    </div>
  )}

  {!consentLoading && !consentError && consents.length > 0 && (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      {consents.map((c) => (
        <div
          key={`${c.encounterId}-${c.type}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "6px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f9fafb",
            fontSize: 12,
          }}
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
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#2563eb",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
          }}
          onClick={() => setProductModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: "95vw",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 8,
              boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
              padding: 16,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Бүтээгдэхүүн сонгох</h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
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
              style={{
                width: "100%",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: "6px 8px",
                fontSize: 13,
              }}
            />

            {productsLoading && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>Бүтээгдэхүүн ачаалж байна...</div>
            )}
            {productsError && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{productsError}</div>
            )}

            {!productsLoading && !productsError && filteredProducts.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>Хайлтад тохирох бүтээгдэхүүн олдсонгүй.</div>
            )}

            <div style={{ marginTop: 8, borderRadius: 6, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAddRowFromProduct(p)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>
                    {p.name}
                    {p.sku ? <span style={{ marginLeft: 6, color: "#6b7280" }}>({p.sku})</span> : null}
                  </div>
                  <div style={{ color: "#6b7280" }}>{Number(p.price || 0).toLocaleString("mn-MN")}₮</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Service picker modal */}
      {serviceModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
          }}
          onClick={closeServiceModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480,
              maxWidth: "95vw",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 8,
              boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
              padding: 16,
              fontSize: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15 }}>Үйлчилгээ сонгох</h3>
              <button
                type="button"
                onClick={closeServiceModal}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
                placeholder="Нэр эсвэл кодоор хайх..."
                style={{
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </div>

            {servicesLoading && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Үйлчилгээнүүдийг ачаалж байна...
              </div>
            )}
            {servicesError && (
              <div style={{ fontSize: 12, color: "#b91c1c" }}>
                {servicesError}
              </div>
            )}

            {!servicesLoading &&
              !servicesError &&
              filteredServices.length === 0 && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Хайлтад тохирох үйлчилгээ олдсонгүй.
                </div>
              )}

            <div
              style={{
                marginTop: 8,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectServiceForRow(s)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    border: "none",
                    borderBottom: "1px solid #f3f4f6",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{s.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      marginTop: 2,
                    }}
                  >
                    Код: {s.code || "-"} • Үнэ:{" "}
                    {s.price.toLocaleString("mn-MN")}₮
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
