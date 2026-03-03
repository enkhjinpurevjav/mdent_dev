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

function PlainField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {value ? (
        <span style={{ marginLeft: 4, whiteSpace: "pre-wrap" }}>{value}</span>
      ) : null}
    </div>
  );
}

function OrthodonticTemplate({
  encounter,
  consent,
}: {
  encounter: Encounter;
  consent: EncounterConsent;
}) {
  const answers = (consent.answers || {}) as Record<string, unknown>;
  const doctorName = formatDoctorDisplayName(encounter.doctor);
  const patientSig = encounter.patientSignaturePath || consent.patientSignaturePath || null;
  const doctorSig = encounter.doctorSignaturePath || consent.doctorSignaturePath || null;

  const orthoMonthlyFee = (answers.orthoMonthlyFee as string) || "";
  const orthoBrokenFee = (answers.orthoBrokenFee as string) || "";
  const orthoRetainerFee = (answers.orthoRetainerFee as string) || "";
  const orthoAccessoryFee = (answers.orthoAccessoryFee as string) || "";
  const orthoNoShowFee3m = (answers.orthoNoShowFee3m as string) || "";
  const orthoNoShowFee6m = (answers.orthoNoShowFee6m as string) || "";
  const orthoNoShowFee9mOrMore = (answers.orthoNoShowFee9mOrMore as string) || "";
  const orthoXrayFee = (answers.orthoXrayFee as string) || "";
  const orthoExtraNotes = (answers.orthoExtraNotes as string) || "";
  const orthoPatientAgreeName = (answers.orthoPatientAgreeName as string) || "";
  const orthoIntroOvog = (answers.orthoIntroOvog as string) || "";
  const orthoIntroName = (answers.orthoIntroName as string) || "";
  const orthoIntroPatientQuestions = (answers.orthoIntroPatientQuestions as string) || "";
  const orthoIntroDoctorAnswer = (answers.orthoIntroDoctorAnswer as string) || "";
  const orthoIntroDoctorExplained = !!(answers.orthoIntroDoctorExplained);
  const orthoIntroPatientUnderstood = !!(answers.orthoIntroPatientUnderstood);

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
      {/* Header — same as RootCanalTemplate */}
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
        Шүд эрүүний гажиг заслын эмчилгээ хийлгэх өвчтөний зөвшөөрлийн хуудас
      </div>

      {/* Intro benefits */}
      <div style={{ marginBottom: 8 }}>
        Нүүр амны гажиг заслын эмчилгээ хийлгэснээр таны:
        <ul style={{ marginTop: 4, paddingLeft: 20 }}>
          <li>Амыг хөндийд эрүүл ахуйн байдал (шүдний цоорол, тулгуур эдийн өвчлөлийг багасгана.)</li>
          <li>Нүүрний гадаад төрх</li>
          <li>Өөртөө итгэх үнэлэмж</li>
          <li>Үйл зүйн тохирлын байдал сайжирна.</li>
        </ul>
      </div>

      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Нүүр амны гажиг заслын эмчилгээний үр дүн нь эмч өвчтөний хамтын үйл ажиллагаанаас шууд
        хамаарадаг ба өвчтөн эмчийн заавар, зөвлөгөөг дагаж мөрдөх шаардлагатай. Учир нь өвчтөн
        эмчийн заавар зөвлөгөөг мөрдөөгүй улмаас эмчилгээний явцад тодорхой хүндрэлүүд гарах
        боломжтой. Гажиг заслын эмчилгээг нь олон улсын мөрдөдөг эмчилгээний стандартыг дагуу
        төлөвлөгдөн эхэлдэг боловч нэр бүрийн хүчин зүйлээс шалтгаалж үйлчлүүлэгч болон
        эмчилгээний үр дүн харилцан адилгүй, мөн хүссэн хэмжээнд хүрэхгүй байх ч тохиолдол
        гардаг. Иймээс эмчилгээний үр дүнг тэр болгог урьдчилан мэдэх боломжгүй тул баталгааг
        өгдөггүй. Гажиг заслын эмчилгээгээр шүдний механик хүч ашиглан шүдүүдийг хөдөлгөн
        зуултыг засдаг бөгөөд зажлах, ярьж, залгих, үлээх үйлдлийн давтамжаас хамаарч тухайн
        хүч нь яс, сурвалж, буйл, шүдний тулгуур эд болон эрүүл үенд ачаалал өгдөг юм.
      </div>

      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Анагаах ухааны салбарт эмчилгээг болон өөрийн хэрэгсэл эрсдэл дагуулдаг бөгөөд зөвхөн
        нэг шүд эрүүний гажиг заслын эмчилгээний явцад дараах хүндрэлүүд гарч болзошгүй.
      </div>

      {/* Complications list 1–4 */}
      <ol style={{ paddingLeft: 20, marginBottom: 8 }}>
        <li>
          Өвчтөн шүдээ тогтмол угаахгүй байх, нүүрс-ус болон чихэрний агууламж өндөртэй
          хүнсний бүтээгдэхүүнүүд хэрэглэхээс шүд эрдэсгүйтэн цоорох, буйл үрэвсэх.
          Үүний улмаас шүдийг 1 удаа фтортуулах шаардлагатай байж болно.
        </li>
        <li>
          Эмчилгээний явцад зарим өвчтөнүүдийн шүдний сурвалж богиносож, яс нь бага
          хэмжээгээр шимэгдэж болно. Харин өвчтөний наснаас хамааран (25 наснаас дээш)
          шүд суух, буйл шамарч, шүд хөдөлгөөнтэй болох хүндрэлүүд гарч болзошгүй.
        </li>
        <li>
          Амны хөндийн эрүүл ахуй дутуу сахиснаар буйл болон шүдний холбоос эдээр
          халдвар дамжиж, шүдийг тойрон хүрээлсэн тулгуур эд гэмтэх, улмаар шүд
          хөдөлгөөнтэй болох эрсдэлтэй.
        </li>
        <li>
          Эмчилгээний дараа бэхжүүлэх зэмсгийг тогтмол зүүхгүй байх, зажлах зуршил
          буруу хэвээр байх, амьсгалаа амаар авах, зуршлын өөрчлөлт хийхгүй байх зэрэг
          нь гажиг давтан үүсэх шалтгаан болдог.
        </li>
      </ol>

      {/* Optional choice section */}
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Сонгож хийх боломж</div>
      <div style={{ textAlign: "justify", marginBottom: 8 }}>
        Гажиг заслын эмчилгээ хийлгэх нь хувь хүний сонголт юм. Иймээс зарим өвчтөн
        эмчилгээний явцад өөрийн шүдний байрлал, зуулт, бүтэц, нүүрний гадаад үзэмж зэрэгт
        сэтгэл ханамжтай байх тохиолдолд эмчилгээг дуусгалгүй орхих боломжтой. Энэ нь
        өвчтөний сонголт юм. Жишээ нь: шүд авахуулах/хийгээр засуулах, эрүү нүүрний мэс
        засал хийлгэхгүй байх, хиймэл шүд хийлгэх зэргийг гажиг заслын эмчилгээ эхлэхээс
        өмнө эмчтэй зөвлөж сонголтоо хийх хэрэгтэй.
      </div>

      {/* Fee section */}
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Төлбөр тооцоо</div>
      <ol style={{ paddingLeft: 20, marginBottom: 8 }}>
        <li>Гажиг заслын эмчилгээний зэмсгийн төлбөр нь таны сонголтоос хамаарна.</li>
        <li>
          Өвчтөн сар бүр давтан үзүүлэхэд{" "}
          <strong>{orthoMonthlyFee || "___"}</strong> төгрөгийн төлбөр төлнө.
        </li>
        <li>
          Зэмсэг унасан, гэмтсэн тохиолдолд зэмсгээс хамааран{" "}
          <strong>{orthoBrokenFee || "___"}</strong> төгрөг нэмж төлнө.
        </li>
        <li>
          Гажиг заслын эмчилгээний үр дүнг бэхжүүлэх зэмсэг нь{" "}
          <strong>{orthoRetainerFee || "___"}</strong> төгрөг байна.
        </li>
      </ol>

      <ol start={6} style={{ paddingLeft: 20, marginBottom: 8 }}>
        <li>
          Гажиг заслын эмчилгээний явцад хэрэглэгдэх нэмэлт тоноглолууд (hook, open coil,
          stopper, torque spring, button, band г.м) тус бүр{" "}
          <strong>{orthoAccessoryFee || "___"}</strong> төгрөгийн төлбөртэй.
        </li>
        <li>
          Эмчилгээний явцад ирэхгүй 3 сар тутамд нэмэлт төлбөр{" "}
          <span
            style={{
              display: "inline-block",
              minWidth: 60,
              borderBottom: "1px solid #000",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            {orthoNoShowFee3m}
          </span>{" "}
          төгрөг бодогдоно.
        </li>
        <li>
          6 сар болон түүнээс дээш хугацаагаар эмчилгээндээ ирэхгүй тохиолдолд рентген
          зураг дахин авч оношлогоо дахин хийнэ. Эмчилгээний төлбөр нэмэлт{" "}
          <strong>{orthoNoShowFee6m || "___"}</strong> төгрөг байна.
        </li>
        <li>
          9 болон түүнээс дээш сараар эмчилгээндээ ирэхгүй бол нэмэлт төлбөр{" "}
          <strong>{orthoNoShowFee9mOrMore || "___"}</strong> авч эмчилгээг дахин эхлүүлнэ.
        </li>
        <li>
          1 жил буюу түүнээс дээш хугацаагаар эмчилгээндээ ирэхгүй тохиолдолд гажиг
          заслын эмчилгээг зогсоож, ахин шинээр хийлгэх эмчилгээг дахин эхлүүлнэ.
        </li>
        <li>
          Гажиг заслын авхдагтай зэмсэг зүүх хугацаанд 6 сар тутам, эмчилгээ дууссаны
          дараа рентген зураг авах ба 1 рентген зургийн төлбөр{" "}
          <strong>{orthoXrayFee || "___"}</strong> төгрөг байна.
        </li>
        {orthoExtraNotes && (
          <li>
            <span style={{ whiteSpace: "pre-wrap" }}>{orthoExtraNotes}</span>
          </li>
        )}
      </ol>

      {/* Patient agree name */}
      <div style={{ marginBottom: 8 }}>
        Танилцуулсан зөвшөөрлийг уншиж зөвшөөрсөн өвчтөн/асран хамгаалагчийн нэр{" "}
        <strong>{orthoPatientAgreeName || "___"}</strong>
        <br />
        Эмчилгээ хийж буй эмчийн нэр <strong>{doctorName}</strong>
      </div>

      {/* Agreement section */}
      <div style={{ borderTop: "1px dashed #000", paddingTop: 8, marginBottom: 8 }}>
        <div
          style={{
            textAlign: "center",
            fontWeight: 700,
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          Эмчилгээний танилцуулга гэрээ
        </div>

        <div style={{ marginBottom: 6 }}>
          <span>Овог: </span><strong>{orthoIntroOvog || "___"}</strong>
          {"  "}
          <span>Нэр: </span><strong>{orthoIntroName || "___"}</strong>
        </div>

        <CheckboxField
          label="Хийгдэхээр төлөвлөгдсөн эмчилгээ болон түүнээс гарч болох хүндрэлүүдийг эмч тайлбарлаж өгсөн болно."
          checked={orthoIntroDoctorExplained}
        />

        <div style={{ textAlign: "justify", marginBottom: 6 }}>
          НАС сургуулийн НАСЭ-т сургалт, эрдэм шинжилгээ, эмчилгээ, үйлчилгээ зэрэг явагддаг
          тул нэгдсэн багээр (эмч, багш, резидент эмч, оюутнууд хамтран) үзлэг, эмчилгээ
          хийхийг зөвшөөрч байна.
        </div>

        <div style={{ marginBottom: 6 }}>
          Эмчийн нэр: <strong>{doctorName}</strong>
        </div>

        <PlainField label="Үйлчлүүлэгчийн асуусан асуулт:" value={orthoIntroPatientQuestions} />
        <PlainField label="Эмчийн хариулт:" value={orthoIntroDoctorAnswer} />

        <CheckboxField
          label="Хийлгэх эмчилгээний талаар дэлгэрэнгүй тайлбар авсан бөгөөд энэхүү эмчилгээг хийлгэхийг зөвшөөрч байна."
          checked={orthoIntroPatientUnderstood}
        />
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
            Үйлчлүүлэгч:{orthoPatientAgreeName ? <strong> {orthoPatientAgreeName}</strong> : null}
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

function ProsthodonticTemplate({
  encounter,
  consent,
}: {
  encounter: Encounter;
  consent: EncounterConsent;
}) {
  const answers = (consent.answers || {}) as Record<string, unknown>;
  const doctorName = formatDoctorDisplayName(encounter.doctor);
  const patientSig = encounter.patientSignaturePath || consent.patientSignaturePath || null;
  const doctorSig = encounter.doctorSignaturePath || consent.doctorSignaturePath || null;

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
      {/* Header — same as RootCanalTemplate */}
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
        НАСЗ заслын эмчилгээний танилцуулах зөвшөөрөл
      </div>

      {/* Intro text */}
      {answers.prosthoIntroText && (
        <div style={{ marginBottom: 8, textAlign: "justify", whiteSpace: "pre-wrap" }}>
          {answers.prosthoIntroText as string}
        </div>
      )}

      {/* Content fields */}
      <PlainField label="Хоёрдох удаагийн ирэлтээр:" value={answers.prosthoSecondVisit as string} />
      <PlainField label="Эмчилгээний сул тал:" value={answers.prosthoWeakPoints as string} />
      <PlainField label="Эмчилгээний явц:" value={answers.prosthoCourse as string} />
      <PlainField label="Эмчилгээний үнэ өртөг:" value={answers.prosthoCost as string} />
      <PlainField
        label="Танилцах зөвшөөрлийг уншиж танилцсан:"
        value={answers.prosthoAcknowledgement as string}
      />

      {/* Doctor */}
      <div style={{ marginBottom: 8, marginTop: 8 }}>
        Эмчлэгч эмч: <strong>{doctorName}</strong>
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
          <div style={{ marginBottom: 6, fontSize: 11 }}>Үйлчлүүлэгч:</div>
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        {/* Left: clinic logo */}
        <div style={{ flex: "0 0 auto", marginRight: 8 }}>
          <img
            src="https://mdent.cloud/clinic-logo.png"
            alt="Clinic logo"
            style={{ maxHeight: 70, maxWidth: 120 }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Center: title + subtitle */}
        <div style={{ flex: 1, textAlign: "center", padding: "0 8px" }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "underline",
              marginBottom: 4,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 10 }}>
            (Өвчтөний түүх/ иргэний эрүүл Мэндийн дэвтэрт хавсаргана)
          </div>
        </div>

        {/* Right: legal text */}
        <div style={{ flex: "0 0 auto", fontSize: 10, textAlign: "right", marginLeft: 8 }}>
          <div>Эрүүл мэндийн сайдын</div>
          <div>2013 оны 11 сарын 25 өдрийн</div>
          <div>446 дугаар тушаалын</div>
          <div>3 дугаар хавсралт</div>
          <div>Маягт 1</div>
        </div>
      </div>

      {/* Section A */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, textDecoration: "underline" }}>
        А) МЭДЭЭЛЛИЙН ХУУДАС
      </div>

      <PlainField label={nameLabel} value={answers.name as string} />
      <PlainField label={outcomeLabel} value={answers.outcome as string} />
      <PlainField
        label="Гарч болох эрсдлүүд (эрсдлүүдийг нэг бүрчлэн дурдана):"
        value={answers.risks as string}
      />
      <PlainField
        label="Гарч болох хүндрэлүүд (хүндрэлүүдийг нэг бүрчлэн дурдана):"
        value={answers.complications as string}
      />
      <PlainField label={additionalProceduresLabel} value={answers.additionalProcedures as string} />
      <PlainField label={alternativeTreatmentsLabel} value={answers.alternativeTreatments as string} />
      <PlainField label={advantagesLabel} value={answers.advantages as string} />

      <div style={{ marginBottom: 4, fontWeight: 600 }}>{anesthesiaHeader}</div>
      <CheckboxField label="Ерөнхий" checked={answers.anesthesiaGeneral as boolean} />
      <CheckboxField label="Нугасны мэдээ алдуулалт" checked={answers.anesthesiaSpinal as boolean} />
      <CheckboxField label="Хэсгийн мэдээ алдуулалт" checked={false} />{/* no stored key per spec */}
      <CheckboxField label="Тайвшруулалт" checked={false} />{/* no stored key per spec */}

      <PlainField
        label="Үйлчлүүлэгчээс тавьсан асуулт:"
        value={answers.patientQuestions as string}
      />
      <PlainField label="Дээрх асуултын товч:" value={answers.questionSummary as string} />
      <PlainField label="Эмчтэй холбоо барих утас:" value={answers.doctorPhone as string} />

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

      <PlainField
        label="Үйлчлүүлэгчийн нэр (гарын үсгийн талбарын оронд):"
        value={answers.patientSignatureName as string}
      />
      <PlainField
        label="Асран хамгаалагч / харгалзан дэмжигчийн нэр (хэрэв үйлчлүүлэгч эрх зүйн чадамжгүй бол):"
        value={answers.guardianName as string}
      />
      <PlainField
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
        <div style={{ marginBottom: 6, marginLeft: 20 }}>
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
      <PlainField label="Нөхрийн нэр:" value={answers.husbandName as string} />
      <PlainField
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

      {!loading && !error && encounter && type === "orthodontic" && consent && (
        <OrthodonticTemplate encounter={encounter} consent={consent} />
      )}

      {!loading && !error && encounter && type === "orthodontic" && !consent && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          Энэ үзлэгт orthodontic зөвшөөрлийн маягт байхгүй байна.
        </div>
      )}

      {!loading && !error && encounter && type === "prosthodontic" && consent && (
        <ProsthodonticTemplate encounter={encounter} consent={consent} />
      )}

      {!loading && !error && encounter && type === "prosthodontic" && !consent && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          Энэ үзлэгт prosthodontic зөвшөөрлийн маягт байхгүй байна.
        </div>
      )}

      {!loading && !error && encounter && type !== "root_canal" && type !== "surgery" && type !== "orthodontic" && type !== "prosthodontic" && (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <strong>Template not implemented</strong> — "{type}" төрлийн зөвшөөрлийн
          маягтын загвар одоогоор бэлэн болоогүй байна.
        </div>
      )}
    </>
  );
}
