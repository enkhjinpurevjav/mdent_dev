import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

type Doctor = { id: number; name?: string | null; ovog?: string | null; email: string };
type Patient = { id: number; name: string; ovog?: string | null; regNo?: string | null };
type PatientBook = { id: number; bookNumber: string; patient: Patient };

type Encounter = {
  id: number;
  visitDate: string;
  doctor: Doctor | null;
  patientBook: PatientBook;
  patientSignaturePath?: string | null;
  doctorSignaturePath?: string | null;
};

type EncounterConsent = {
  encounterId: number;
  type: string;
  answers: Record<string, unknown> | null;
  patientSignedAt?: string | null;
  doctorSignedAt?: string | null;
  patientSignaturePath?: string | null;
  doctorSignaturePath?: string | null;
};

function formatDoctorDisplayName(d: Doctor | null): string {
  if (!d) return "-";
  const name = (d.name || "").trim();
  const ovog = (d.ovog || "").trim();
  if (name && ovog) return `${ovog.charAt(0).toUpperCase()}.${name}`;
  if (name) return name;
  return d.email || "-";
}

function RootCanalTemplate({
  encounter,
  consent,
}: {
  encounter: Encounter;
  consent: EncounterConsent;
}) {
  const answers = (consent.answers || {}) as Record<string, unknown>;
  const patientName = (answers.patientName as string) || "";
  const doctorName = formatDoctorDisplayName(encounter.doctor);
  const patientSig = consent.patientSignaturePath || encounter.patientSignaturePath || null;
  const doctorSig = consent.doctorSignaturePath || encounter.doctorSignaturePath || null;

  return (
    <div
      style={{
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: 11,
        lineHeight: 1.45,
        color: "#000",
        padding: "10mm 14mm",
        maxWidth: "210mm",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <img
          src="https://mdent.cloud/clinic-logo.png"
          alt="Clinic logo"
          style={{ maxHeight: 60, maxWidth: 180 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        
        <div style={{ fontSize: 11 }}>
          Утас: 7777-1234 | Хаяг: Улаанбаатар
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          textAlign: "center",
          fontWeight: 700,
          fontSize: 13,
          textDecoration: "underline",
          marginBottom: 10,
        }}
      >
        Шүдний сувгийн эмчилгээ хийх танилцсан зөвшөөрлийн хуудас
      </div>

      {/* Body text */}
      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Шүдний сувгийн (endodont) эмчилгээ нь шүдний цөгц болон сурвалжийн хөндийд
        байрлах мэдрэл судасны багц (зөөлц)-д үүссэн өвдөлт үрэвслийг эмчлэх олон
        удаагийн (3-5 удаагийн ирэлт болон тухайн шүдний үрэвслийн байдлаас
        шалтгаалан 5-с дээш 6 сар хүртэл хугацаагаар) ирэлтээр эмчлэгддэг курс
        эмчилгээ юм. Сувгийн эмчилгээгээр суваг доторх үрэвслийг намдаадаг боловч
        шүдний сурвалжийн оройн эдийн өөрчлөлт нь хэвийн байдалд эргэн орж,
        эдгэрэхэд хугацаа шаардагддаг.
      </div>
      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Сувгийн эмчилгээний эхний 1-7 хоногт эмчилгээтэй шүднүүдэд эвгүй
        мэдрэмжүүд үүсч болно. Тэр хугацаанд тухайн шүдээр ачаалал үүсэх хэт
        хатуу (ааруул, хатуу чихэр, үртэй жимс, самар... гэх мэт) зүйлс хазаж
        идэхийг хатуу хориглоно. Хатуу зүйлс нь тухайн шүдний зовиур таагүй
        мэдрэмжүүдийг ихэсгэх, мөн эрдэсгүйжсэн шүдний (сувгийн эмчилгээтэй шүд
        нь мэдрэл судасгүй болсны улмаас хэврэг болдог) цөгцний болон сурвалжийн
        хугарал үүсч цаашлаад тухайн шүд авагдах хүртэл хүндрэл үүсч болдог.
      </div>
      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Эмчилгээ хийлгэсэн шүд хэсэг хугацааны дараа өнгө хувирч болно. Цоорол их
        хэмжээгээр үүсч шүдний цөгцний ихэнхи хэсэг цооролд өртсөн (цөгцний
        ½-1/3 хүртэл) шүдэнд сувгийн эмчилгээний дараа голонцор (метал, шилэн)
        ашиглан тухайн шүдийг сэргээдэг. Сувгийн эмчилгээ ихэнхи тохиолдолд тухайн
        хүний дархлааны системтэй хамааралтай байдаг ба даарч хөрөх, ханиад томуу,
        стресс ядаргаа, ажлын ачаалал, нойргүйдэл, дааврын өөрчлөлт (жирэмсэн,
        хөхүүл, архаг хууч өвчтэй хүмүүс, өндөр настнууд) зэрэг нь эмчилгээний
        хугацаа болон үр дүнг уртасгаж удаашруулж болно.
      </div>
      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Эмчилгээний явцад үйлчлүүлэгч эмчийн заасан хугацаанд эмчилгээндээ ирэхгүй
        байх, эмчийн бичиж өгсөн эм, уусмалыг зааврын дагуу уухгүй байх, огт
        хэрэглээгүй байх зэрэг нь эмчилгээний үр дүнд шууд нөлөөлөх ба аливаа
        хүндрэл (эрүүл мэнд болон санхүүгийн) эрсдэлийг тухайн үйлчлүүлэгч өөрөө
        бүрэн хариуцна.
      </div>
      <div style={{ textAlign: "justify", marginBottom: 10 }}>
        Үүсч болох эрсдлүүд: Сувгийн эмчилгээг шүдний сувагт тохирсон зориулалтын
        нарийн багажнуудаар жижгээс томруулах зарчимаар хийдэг эмчилгээ бөгөөд
        зарим шүдний сурвалж анатомын онцлогоос хамаарч хэт далий муруй, нарийн
        байснаас болж эмчийн ажиллах явцад сувагт багаж хугарах, сурвалж цоорох,
        сурвалж, цөгц хугарах, мэдээ алдуулах тарианд харшлах зэрэг эрсдлүүд үүсч
        болно.
      </div>

      {/* Signature block */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 12,
          borderTop: "1px solid #000",
          paddingTop: 10,
        }}
      >
        {/* Patient column */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6, fontSize: 11 }}>
            Уншиж танилцсан үйлчлүүлэгч:{" "}
            <strong>{patientName}</strong>
          </div>
          {patientSig ? (
            <img
              src={patientSig}
              alt="Patient signature"
              style={{
                maxWidth: "100%",
                maxHeight: 70,
                border: "1px solid #ccc",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                height: 50,
                borderBottom: "1px solid #000",
                width: "80%",
              }}
            />
          )}
          <div style={{ fontSize: 10, marginTop: 2 }}>Гарын үсэг</div>
        </div>

        {/* Doctor column */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6, fontSize: 11 }}>
            Эмчлэгч эмчийн: <strong>{doctorName}</strong>
          </div>
          {doctorSig ? (
            <img
              src={doctorSig}
              alt="Doctor signature"
              style={{
                maxWidth: "100%",
                maxHeight: 70,
                border: "1px solid #ccc",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                height: 50,
                borderBottom: "1px solid #000",
                width: "80%",
              }}
            />
          )}
          <div style={{ fontSize: 10, marginTop: 2 }}>Гарын үсэг</div>
        </div>
      </div>
    </div>
  );
}

function DottedField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div
        style={{
          borderBottom: "1px solid #000",
          minHeight: 18,
          paddingBottom: 1,
        }}
      >
        {value || ""}
      </div>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
}: {
  label: string;
  checked?: boolean | null;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span
        style={{
          display: "inline-block",
          width: 13,
          height: 13,
          border: "1px solid #000",
          textAlign: "center",
          lineHeight: "13px",
          fontSize: 10,
          marginRight: 6,
          verticalAlign: "middle",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span style={{ verticalAlign: "middle" }}>{label}</span>
    </div>
  );
}

function SurgeryTemplate({
  encounter,
  consent,
}: {
  encounter: Encounter;
  consent: EncounterConsent;
}) {
  const answers = (consent.answers || {}) as Record<string, unknown>;
  const surgeryMode = (answers.surgeryMode as string) || "SURGERY";
  const isProcedure = surgeryMode === "PROCEDURE";
  const title = isProcedure
    ? "МЭС АЖИЛБАР ХИЙЛГЭХ ТУХАЙ ЗӨВШӨӨРЛИЙН ХУУДАС"
    : "МЭС ЗАСАЛ ХИЙЛГЭХ ТУХАЙ ЗӨВШӨӨРЛИЙН ХУУДАС";

  const doctorName = formatDoctorDisplayName(encounter.doctor);
  const patientSignatureName = (answers.patientSignatureName as string) || "";
  const patientSig = consent.patientSignaturePath || encounter.patientSignaturePath || null;
  const doctorSig = consent.doctorSignaturePath || encounter.doctorSignaturePath || null;

  const incapacityReason = (answers.incapacityReason as Record<string, unknown> | undefined) || {};

  const nameLabel = isProcedure
    ? "Санал болгож буй мэс ажилбарын нэр:"
    : "Санал болгож буй мэс заслын нэр:";
  const outcomeLabel = isProcedure
    ? "Санал болгож буй мэс ажилбарын үр дүн (эмнэл зүйн туршлагын дүн, нотолгоонд тулгуурлан бүрэн эдгэрэлт, сайжралт, эндэгдэл, хүндрэлийн магадлалыг хувиар илэрхийлэн ойлгомжтойгоор тайлбарлана):"
    : "Санал болгож буй мэс заслын үр дүн (эмнэл зүйн туршлагын дүн, нотолгоонд тулгуурлан бүрэн эдгэрэлт, сайжралт, эндэгдэл, хүндрэлийн магадлалыг хувиар илэрхийлэн тайлбарлана):";
  const additionalProceduresLabel = isProcedure
    ? "Тухайн мэс ажилбарын үед хийгдэж болох нэмэлт ажилбарууд (ажилбаруудыг нэг бүрчлэн дурдана):"
    : "Тухайн мэс заслын үед хийгдэж болох нэмэлт ажилбарууд:";
  const alternativeTreatmentsLabel = isProcedure
    ? "Тухайн мэс ажилбар орлуулах боломжтой эмчилгээний бусад аргууд (бусад аргуудыг дурдана):"
    : "Тухайн мэс заслыг орлуулах боломжтой бусад эмчилгээний аргууд:";
  const advantagesLabel = isProcedure
    ? "Санал болгож буй мэс ажилбарын давуу тал:"
    : "Санал болгож буй мэс заслын давуу тал:";
  const anesthesiaHeader = isProcedure
    ? "Санал болгож буй мэс ажилбарын үед хийгдэх мэдээгүйжүүлэлт:"
    : "Санал болгож буй мэс заслын үед хийгдэх мэдээгүйжүүлэлт:";

  return (
    <div
      style={{
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: 11,
        lineHeight: 1.45,
        color: "#000",
        padding: "10mm 14mm",
        maxWidth: "210mm",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <img
          src="https://mdent.cloud/clinic-logo.png"
          alt="Clinic logo"
          style={{ maxHeight: 60, maxWidth: 180 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div style={{ fontSize: 11 }}>Утас: 7777-1234 | Хаяг: Улаанбаатар</div>
      </div>

      {/* Title */}
      <div
        style={{
          textAlign: "center",
          fontWeight: 700,
          fontSize: 13,
          textDecoration: "underline",
          marginBottom: 12,
        }}
      >
        {title}
      </div>

      {/* Section A */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, textDecoration: "underline" }}>
        А) МЭДЭЭЛЛИЙН ХУУДАС
      </div>

      <DottedField label={nameLabel} value={answers.name as string} />
      <DottedField label={outcomeLabel} value={answers.outcome as string} />
      <DottedField
        label="Гарч болох эрсдлүүд (эрсдлүүдийг нэг бүрчлэн дурдана):"
        value={answers.risks as string}
      />
      <DottedField
        label="Гарч болох хүндрэлүүд (хүндрэлүүдийг нэг бүрчлэн дурдана):"
        value={answers.complications as string}
      />
      <DottedField label={additionalProceduresLabel} value={answers.additionalProcedures as string} />
      <DottedField label={alternativeTreatmentsLabel} value={answers.alternativeTreatments as string} />
      <DottedField label={advantagesLabel} value={answers.advantages as string} />

      <div style={{ marginBottom: 4, fontWeight: 600 }}>{anesthesiaHeader}</div>
      <CheckboxField label="Ерөнхий" checked={answers.anesthesiaGeneral as boolean} />
      <CheckboxField label="Нугасны мэдээ алдуулалт" checked={answers.anesthesiaSpinal as boolean} />
      <CheckboxField label="Хэсгийн мэдээ алдуулалт" checked={answers.anesthesiaLocal as boolean} />
      <CheckboxField label="Тайвшруулалт" checked={answers.anesthesiaSedation as boolean} />

      <DottedField
        label="Үйлчлүүлэгчээс тавьсан асуулт:"
        value={answers.patientQuestions as string}
      />
      <DottedField label="Дээрх асуултын товч:" value={answers.questionSummary as string} />
      <DottedField label="Эмчтэй холбоо барих утас:" value={answers.doctorPhone as string} />

      <CheckboxField
        label="Би үйлчлүүлэгчдээ дээрх мэдээллүүдийг дэлгэрэнгүй, энгийн ойлгомжтой хэллэгээр тайлбарлаж өгсөн болно."
        checked={answers.doctorExplained as boolean}
      />

      {/* Section B */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 12,
          marginTop: 14,
          marginBottom: 6,
          textDecoration: "underline",
        }}
      >
        Б) ҮЙЛЧЛҮҮЛЭГЧИЙН ЗӨВШӨӨРӨЛ
      </div>

      <CheckboxField
        label="Эмчийн санал болгож буй мэс засал / мэс ажилбарыг дээрхи мэдээ алдуулалтаар хийлгэхийг БИ ЗӨВШӨӨРЧ БАЙНА. Түүнчлэн гэмтсэн эд, эрхтний хэсэг болон эд эрхтнийг журмын дагуу устгахыг уг эмнэлэгт зөвшөөрч байна."
        checked={answers.patientConsentMain as boolean}
      />
      <CheckboxField
        label="Мэс засал / мэс ажилбарын үр дүн, гарч болох хүндрэл, эрсдэл, нэмэлт ажилбарууд, орлуулж болох эмчилгээний талаар БИ тодорхой мэдээлэл авсан болно."
        checked={answers.patientConsentInfo as boolean}
      />

      <DottedField
        label="Үйлчлүүлэгчийн нэр (гарын үсгийн талбарын оронд):"
        value={answers.patientSignatureName as string}
      />
      <DottedField
        label="Асран хамгаалагч / харгалзан дэмжигчийн нэр (хэрэв үйлчлүүлэгч эрх зүйн чадамжгүй бол):"
        value={answers.guardianName as string}
      />
      <DottedField
        label="Холбоо, хамаарал (нөхөр, аав, ээж гэх мэт):"
        value={answers.guardianRelationDescription as string}
      />

      <div style={{ marginBottom: 4, fontWeight: 600 }}>
        Үйлчлүүлэгч эрх зүйн чадамжгүй байгаа шалтгаан:
      </div>
      <CheckboxField label="Насанд хүрээгүй" checked={!!incapacityReason.minor} />
      <CheckboxField label="Ухаангүй" checked={!!incapacityReason.unconscious} />
      <CheckboxField label="Сэтгэцийн эмгэгтэй" checked={!!incapacityReason.mentalDisorder} />
      <CheckboxField label="Бусад (тайлбарлана уу)" checked={!!incapacityReason.other} />
      {incapacityReason.otherText && (
        <div
          style={{
            marginBottom: 6,
            marginLeft: 20,
            borderBottom: "1px solid #000",
            minHeight: 18,
            paddingBottom: 1,
          }}
        >
          {incapacityReason.otherText as string}
        </div>
      )}

      <div style={{ marginTop: 8, marginBottom: 4, fontWeight: 600 }}>
        Хэрэв өвчтөн жирэмсэн тохиолдолд:
      </div>
      <CheckboxField
        label="Миний эхнэрийн хийлгэхээр зөвшөөрсөн мэс ажилбар / мэс заслыг би зөвшөөрч байна."
        checked={answers.husbandConsent as boolean}
      />
      <DottedField label="Нөхрийн нэр:" value={answers.husbandName as string} />
      <DottedField
        label="Хэрэв нөхөр / асран хамгаалагч / харгалзан дэмжигч нь зөвшөөрөөгүй бол тайлбарлана уу:"
        value={answers.husbandRefuseReason as string}
      />

      {/* Signature block */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 16,
          borderTop: "1px solid #000",
          paddingTop: 10,
        }}
      >
        {/* Patient column */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6, fontSize: 11 }}>
            Үйлчлүүлэгч:{patientSignatureName ? <strong> {patientSignatureName}</strong> : null}
          </div>
          {patientSig ? (
            <img
              src={patientSig}
              alt="Patient signature"
              style={{
                maxWidth: "100%",
                maxHeight: 70,
                border: "1px solid #ccc",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                height: 50,
                borderBottom: "1px solid #000",
                width: "80%",
              }}
            />
          )}
          <div style={{ fontSize: 10, marginTop: 2 }}>Гарын үсэг</div>
        </div>

        {/* Doctor column */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6, fontSize: 11 }}>
            Эмчлэгч эмч: <strong>{doctorName}</strong>
          </div>
          {doctorSig ? (
            <img
              src={doctorSig}
              alt="Doctor signature"
              style={{
                maxWidth: "100%",
                maxHeight: 70,
                border: "1px solid #ccc",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                height: 50,
                borderBottom: "1px solid #000",
                width: "80%",
              }}
            />
          )}
          <div style={{ fontSize: 10, marginTop: 2 }}>Гарын үсэг</div>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPrintPage() {
  const router = useRouter();
  const { encounterId: encIdParam, type: typeParam } = router.query;

  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [consent, setConsent] = useState<EncounterConsent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) return;

    const encId = Number(encIdParam);
    const type = String(typeParam || "").trim();

    if (!encId || Number.isNaN(encId) || !type) {
      setError("encounterId болон type параметр шаардлагатай.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [encRes, consentsRes] = await Promise.all([
          fetch(`/api/encounters/${encId}`),
          fetch(`/api/encounters/${encId}/consents`),
        ]);

        const encData = await encRes.json().catch(() => null);
        if (!encRes.ok || !encData || !encData.id) {
          throw new Error(
            (encData && encData.error) ||
              `Үзлэгийн мэдээлэл ачаалахад алдаа гарлаа (HTTP ${encRes.status}).`
          );
        }

        const consentsData: EncounterConsent[] = await consentsRes.json().catch(() => []);
        const matched = Array.isArray(consentsData)
          ? consentsData.find((c) => c.type === type) || null
          : null;

        setEncounter(encData as Encounter);
        setConsent(matched);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Зөвшөөрлийн мэдээлэл ачаалахад алдаа гарлаа.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router.isReady, encIdParam, typeParam]);

  useEffect(() => {
    if (!loading && !error && encounter) {
      // Small delay to allow images (signatures, logo) to begin loading before print dialog opens
      const PRINT_DELAY_MS = 400;
      const timer = setTimeout(() => {
        window.print();
      }, PRINT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [loading, error, encounter]);

  const type = String(typeParam || "").trim();

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        body { margin: 0; background: #fff; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {loading && (
        <div style={{ padding: 32, textAlign: "center", fontFamily: "sans-serif" }}>
          Ачааллаж байна...
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: 32, color: "#b91c1c", fontFamily: "sans-serif" }}>
          {error}
        </div>
      )}

      {!loading && !error && encounter && type === "root_canal" && consent && (
        <RootCanalTemplate encounter={encounter} consent={consent} />
      )}

      {!loading && !error && encounter && type === "root_canal" && !consent && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          Энэ үзлэгт root_canal зөвшөөрлийн маягт байхгүй байна.
        </div>
      )}

      {!loading && !error && encounter && type === "surgery" && consent && (
        <SurgeryTemplate encounter={encounter} consent={consent} />
      )}

      {!loading && !error && encounter && type === "surgery" && !consent && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          Энэ үзлэгт surgery зөвшөөрлийн маягт байхгүй байна.
        </div>
      )}

      {!loading && !error && encounter && type !== "root_canal" && type !== "surgery" && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <strong>Template not implemented</strong> — "{type}" төрлийн зөвшөөрлийн
          маягтын загвар одоогоор бэлэн болоогүй байна.
        </div>
      )}
    </>
  );
}
