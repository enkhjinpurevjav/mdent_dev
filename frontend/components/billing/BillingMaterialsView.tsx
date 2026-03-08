import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { printImage } from "../../utils/printImage";

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
  encounterId: number;
  items: PrescriptionItem[];
};

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
  answers: unknown;
  patientSignedAt?: string | null;
  doctorSignedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type EbarimtReceipt = {
  id?: string | null;
  date?: string | null;
  lottery?: string | null;
  totalAmount?: number | null;
  qrData?: string | null;
  status?: string | null;
  ddtd?: string | null;
  printedAtText?: string | null;
};

type InvoiceData = {
  hasEBarimt?: boolean;
  ebarimtReceipt?: EbarimtReceipt | null;
  status?: string;
};

type EncounterData = {
  id: number;
  prescription?: Prescription | null;
};

const CONSENT_TYPE_LABELS: Record<string, string> = {
  root_canal: "Сувгийн эмчилгээ",
  surgery: "Мэс засал",
  orthodontic: "Гажиг засал",
  prosthodontic: "Согог засал",
};

function formatConsentTypeLabel(type: string): string {
  return CONSENT_TYPE_LABELS[type] ?? type;
}

function formatMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "0";
  return new Intl.NumberFormat("mn-MN").format(Number(v));
}

type Props = {
  encounterId: number;
};

export default function BillingMaterialsView({ encounterId }: Props) {
  const [encounter, setEncounter] = useState<EncounterData | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [xrays, setXrays] = useState<EncounterMedia[]>([]);
  const [consents, setConsents] = useState<EncounterConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!encounterId || Number.isNaN(encounterId)) return;

    const loadAll = async () => {
      setLoading(true);
      setError("");
      try {
        const [encRes, invRes, xrayRes, consentRes] = await Promise.all([
          fetch(`/api/encounters/${encounterId}`),
          fetch(`/api/billing/encounters/${encounterId}/invoice`),
          fetch(`/api/encounters/${encounterId}/media?type=XRAY`),
          fetch(`/api/encounters/${encounterId}/consents`),
        ]);

        const encData = await encRes.json().catch(() => null);
        if (encRes.ok && encData?.id) {
          setEncounter(encData);
        }

        const invData = await invRes.json().catch(() => null);
        if (invRes.ok && invData) {
          setInvoice(invData);
        }

        const xrayData = await xrayRes.json().catch(() => null);
        setXrays(Array.isArray(xrayData) ? xrayData : []);

        const consentData = await consentRes.json().catch(() => null);
        setConsents(Array.isArray(consentData) ? consentData : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Хавсралтын мэдээлэл ачаалж чадсангүй.");
      } finally {
        setLoading(false);
      }
    };

    void loadAll();
  }, [encounterId]);

  if (loading) {
    return (
      <div className="text-center p-10 text-gray-500">
        Ачаалж байна...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        {error}
      </div>
    );
  }

  const receipt = invoice?.ebarimtReceipt;
  const hasEbarimt = invoice?.hasEBarimt && receipt;
  const prescription = encounter?.prescription;

  return (
    <div className="flex flex-col gap-4">
      {/* Print-only styles: hide everything except the e-Barimt receipt */}
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
      {/* Hidden print container for e-Barimt receipt */}
      {hasEbarimt && (
        <div className="ebarimt-receipt-print-root">
          <div className="w-[215px] py-2 px-[6px] font-mono text-[11px] leading-snug">
            <hr className="my-1" />
            {receipt!.ddtd && <div>ДДТД: {receipt!.ddtd}</div>}
            {receipt!.printedAtText && <div>Огноо: {receipt!.printedAtText}</div>}
            {receipt!.lottery && <div>Сугалаа: {receipt!.lottery}</div>}
            {receipt!.qrData && (
              <div className="text-center my-[6px]">
                <QRCodeSVG value={receipt!.qrData} size={140} />
              </div>
            )}
            <div className="font-bold mt-0.5">
              Нийт дүн: {formatMoney(receipt!.totalAmount)}₮
            </div>
          </div>
        </div>
      )}

      {/* e-Barimt */}
      <section
        className="p-4 rounded-lg border border-gray-200 bg-white"
      >
        <h3 className="text-[15px] m-0 mb-2">e-Barimt</h3>
        {!hasEbarimt ? (
          <div className="text-xs text-gray-500">
            e-Barimt олгогдоогүй.
          </div>
        ) : (
          <div className="text-[13px]">
            {receipt!.ddtd && (
              <div>
                <strong>ДДТД:</strong> {receipt!.ddtd}
              </div>
            )}
            {receipt!.printedAtText && (
              <div>
                <strong>Огноо:</strong> {receipt!.printedAtText}
              </div>
            )}
            {receipt!.lottery && (
              <div>
                <strong>Сугалаа:</strong> {receipt!.lottery}
              </div>
            )}
            {receipt!.totalAmount != null && (
              <div>
                <strong>Нийт дүн:</strong> {formatMoney(receipt!.totalAmount)}₮
              </div>
            )}
            {receipt!.qrData && (
              <div className="mt-2">
                <QRCodeSVG value={receipt!.qrData} size={120} />
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
        )}
      </section>

      {/* Printable materials */}
      <section
        className="p-4 rounded-lg border border-gray-200 bg-white"
      >
        <h3 className="text-[15px] m-0 mb-1">
          Хэвлэх боломжтой материалууд
        </h3>
        <div className="text-xs text-gray-500 mb-2">
          Үйлчлүүлэгчид цаасаар өгөх шаардлагатай мэдээллүүд.
        </div>

        {/* Prescription */}
        <div
          className="mt-3 pt-3 border-t border-gray-200"
        >
          <h4 className="m-0 text-sm mb-[6px]">Эмийн жор</h4>
          {prescription?.items?.length ? (
            <ol className="m-0 pl-[18px] text-xs">
              {prescription.items
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
          ) : (
            <div className="text-xs text-gray-500">
              Энэ үзлэгт эмийн жор байхгүй.
            </div>
          )}
        </div>

        {/* XRAY */}
        <div
          className="mt-3 pt-3 border-t border-gray-200"
        >
          <h4 className="m-0 text-sm mb-[6px]">XRAY зураг</h4>
          {xrays.length === 0 ? (
            <div className="text-xs text-gray-500">
              XRAY зураг хавсаргагдаагүй.
            </div>
          ) : (
            <div className="flex flex-col gap-[6px]">
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

        {/* Consent forms */}
        <div
          className="mt-3 pt-3 border-t border-gray-200"
        >
          <h4 className="m-0 text-sm mb-[6px]">
            Зөвшөөрлийн маягт
          </h4>
          {consents.length === 0 ? (
            <div className="text-xs text-gray-500">
              Энэ үзлэгт бөглөгдсөн зөвшөөрлийн маягт байхгүй.
            </div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {consents.map((c) => (
                <div
                  key={`${c.encounterId}-${c.type}`}
                  className="flex items-center justify-between gap-2 py-[6px] px-2 border border-gray-200 rounded-lg bg-gray-50 text-xs"
                >
                  <div>
                    <strong>Төрөл:</strong> {formatConsentTypeLabel(c.type)}
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
    </div>
  );
}
