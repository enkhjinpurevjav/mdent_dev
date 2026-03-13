import React, { useRef } from "react";
import type {
  Encounter,
  EncounterConsent,
  ConsentType,
} from "../../types/encounter-admin";
import { formatDateTime, formatShortDate } from "../../utils/date-formatters";
import { formatDoctorDisplayName } from "../../utils/name-formatters";
import SignaturePad, { type SignaturePadRef } from "../SignaturePad";

type ConsentFormsBlockProps = {
  encounter: Encounter;
  consents: EncounterConsent[];
  consentTypeDraft: ConsentType | null;
  consentAnswersDraft: any;
  consentSaving: boolean;
  consentLoading: boolean;
  consentError: string;
  uploadingPatientSignature: boolean;
  uploadingDoctorSignature: boolean;
  attachingDoctorSignature: boolean;
  onConsentTypeDraftChange: (type: ConsentType | null) => void;
  onConsentAnswersDraftUpdate: (partial: any) => void;
  onSaveConsent: () => Promise<void>;
  onSaveConsentApi: (type: ConsentType | null) => Promise<void>;
  onPatientSignatureUpload: (blob: Blob) => Promise<void>;
  onDoctorSignatureUpload: (blob: Blob) => Promise<void>;
  onAttachDoctorSignature: () => Promise<void>;
  hideTopCheckbox?: boolean;
};

export default function ConsentFormsBlock({
  encounter,
  consents,
  consentTypeDraft,
  consentAnswersDraft,
  consentSaving,
  consentLoading,
  consentError,
  uploadingPatientSignature,
  uploadingDoctorSignature,
  attachingDoctorSignature,
  onConsentTypeDraftChange,
  onConsentAnswersDraftUpdate,
  onSaveConsent,
  onSaveConsentApi,
  onPatientSignatureUpload,
  onDoctorSignatureUpload,
  onAttachDoctorSignature,
  hideTopCheckbox = false,
}: ConsentFormsBlockProps) {
  const updateConsentAnswers = onConsentAnswersDraftUpdate;
  const saveConsentApi = onSaveConsentApi;
  const saveCurrentConsent = onSaveConsent;
  const setConsentTypeDraft = onConsentTypeDraftChange;
  const setConsentAnswersDraft = onConsentAnswersDraftUpdate;

  const patientSigRef = useRef<SignaturePadRef>(null);
  const doctorSigRef = useRef<SignaturePadRef>(null);

  return (
    <>
            <div
              style={{
                marginTop: 4,
                marginBottom: 4,
                padding: 8,
                borderRadius: 6,
                border: "1px dashed #e5e7eb",
                background: "#f9fafb",
              }}
            >
              {!hideTopCheckbox && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={consents.length > 0}
                    disabled={consentLoading || consentSaving}
                    onChange={async (e) => {
                      if (e.target.checked) {
                        await saveConsentApi("root_canal");
                      } else {
                        await saveConsentApi(null);
                      }
                    }}
                  />
                  <span>Зөвшөөрлийн хуудас шаардлагатай</span>
                </label>

                {consentLoading && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    (ачаалж байна...)
                  </span>
                )}

                {consentError && (
                  <span style={{ fontSize: 12, color: "#b91c1c" }}>
                    {consentError}
                  </span>
                )}
              </div>
              )}

              {consents.length > 0 && (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      fontSize: 13,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>Төрөл:</span>

                    <label
                      style={{
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="consentType"
                        value="root_canal"
                        checked={consentTypeDraft === "root_canal"}
                        disabled={consentSaving}
                        onChange={() => {
                          setConsentTypeDraft("root_canal");
                          const existingConsent = consents.find((c) => c.type === "root_canal");
                          if (existingConsent) {
                            setConsentAnswersDraft(existingConsent.answers || {});
                          } else {
                            setConsentAnswersDraft({});
                            void saveConsentApi("root_canal");
                          }
                        }}
                      />
                      Сувгийн эмчилгээ
                    </label>

                    <label
                      style={{
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="consentType"
                        value="surgery"
                        checked={consentTypeDraft === "surgery"}
                        disabled={consentSaving}
                        onChange={() => {
                          setConsentTypeDraft("surgery");
                          const existingConsent = consents.find((c) => c.type === "surgery");
                          if (existingConsent) {
                            setConsentAnswersDraft(existingConsent.answers || {});
                          } else {
                            setConsentAnswersDraft({});
                            void saveConsentApi("surgery");
                          }
                        }}
                      />
                      Мэс засал
                    </label>

                    <label
                      style={{
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="consentType"
                        value="orthodontic"
                        checked={consentTypeDraft === "orthodontic"}
                        disabled={consentSaving}
                        onChange={() => {
                          setConsentTypeDraft("orthodontic");
                          const existingConsent = consents.find((c) => c.type === "orthodontic");
                          if (existingConsent) {
                            setConsentAnswersDraft(existingConsent.answers || {});
                          } else {
                            setConsentAnswersDraft({});
                            void saveConsentApi("orthodontic");
                          }
                        }}
                      />
                      Гажиг засал
                    </label>

                    <label
                      style={{
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="consentType"
                        value="prosthodontic"
                        checked={consentTypeDraft === "prosthodontic"}
                        disabled={consentSaving}
                        onChange={() => {
                          setConsentTypeDraft("prosthodontic");
                          const existingConsent = consents.find((c) => c.type === "prosthodontic");
                          if (existingConsent) {
                            setConsentAnswersDraft(existingConsent.answers || {});
                          } else {
                            setConsentAnswersDraft({});
                            void saveConsentApi("prosthodontic");
                          }
                        }}
                      />
                      Согог засал
                    </label>
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 4,
                      borderTop: "1px dashed #e5e7eb",
                      fontSize: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {consentTypeDraft === "root_canal" && (
                      <div>
                        <div
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 8,
                          }}
                        >
                          “MON FAMILY” Шүдний эмнэлгийн шүдний сувгийн эмчилгээ
                          хийх таниулсан зөвшөөрлийн хуудас
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: "#111827",
                            marginBottom: 8,
                            whiteSpace: "pre-line",
                          }}
                        >
                          Шүдний сувгийн (endodont) эмчилгээ нь шүдний цөгц болон
                          сурвалжийн хөндийд байрлах мэдрэл судасны багц
                          (зөөлц)-д үүссэн өвдөлт үрэвслийг эмчлэх олон удаагийн
                          (3-5 удаагийн ирэлт болон тухайн шүдний үрэвслийн
                          байдлаас шалтгаалан 5-с дээш 6 сар хүртэл хугацаагаар)
                          ирэлтээр эмчлэгддэг курс эмчилгээ юм. Сувгийн
                          эмчилгээгээр суваг доторх үрэвслийг намдаадаг боловч
                          шүдний сурвалжийн оройн эдийн өөрчлөлт нь хэвийн
                          байдалд эргэн орж, эдгэрэхэд хугацаа шаардагддаг.
                          {"\n\n"}
                          Сувгийн эмчилгээний эхний 1-7 хоногт эмчилгээтэй
                          шүднүүдэд эвгүй мэдрэмжүүд үүсч болно. Тэр хугацаанд
                          тухайн шүдээр ачаалал үүсэх хэт хатуу (ааруул, хатуу
                          чихэр, үртэй жимс, самар... гэх мэт) зүйлс хазаж идэхийг
                          хатуу хориглоно. Хатуу зүйлс нь тухайн шүдний зовиур
                          таагүй мэдрэмжүүдийг ихэсгэх, мөн эрдэсгүйжсэн шүдний
                          (сувгийн эмчилгээтэй шүд нь мэдрэл судасгүй болсны
                          улмаас хэврэг болдог) цөгцний болон сурвалжийн хугарал
                          үүсч цаашлаад тухайн шүд авагдах хүртэл хүндрэл үүсч
                          болдог.
                          {"\n\n"}
                          Эмчилгээ хийлгэсэн шүд хэсэг хугацааны дараа өнгө
                          хувирч болно. Цоорол их хэмжээгээр үүсч шүдний цөгцний
                          ихэнхи хэсэг цооролд өртсөн (цөгцний ½-1/3 хүртэл)
                          шүдэнд сувгийн эмчилгээний дараа голонцор (метал,
                          шилэн) ашиглан тухайн шүдийг сэргээдэг. Сувгийн
                          эмчилгээ ихэнхи тохиолдолд тухайн хүний дархлааны
                          системтэй хамааралтай байдаг ба даарч хөрөх, ханиад
                          томуу, стресс ядаргаа, ажлын ачаалал, нойргүйдэл,
                          дааврын өөрчлөлт (жирэмсэн, хөхүүл, архаг хууч
                          өвчтэй хүмүүс, өндөр настнууд) зэрэг нь эмчилгээний
                          хугацаа болон үр дүнг уртасгаж удаашруулж болно.
                          {"\n\n"}
                          Эмчилгээний явцад үйлчлүүлэгч эмчийн заасан хугацаанд
                          эмчилгээндээ ирэхгүй байх, эмчийн бичиж өгсөн эм,
                          уусмалыг зааврын дагуу уухгүй байх, огт хэрэглээгүй
                          байх зэрэг нь эмчилгээний үр дүнд шууд нөлөөлөх ба
                          аливаа хүндрэл (эрүүл мэнд болон санхүүгийн) эрсдэлийг
                          тухайн үйлчлүүлэгч өөрөө бүрэн хариуцна.
                          {"\n\n"}
                          Үүсч болох эрсдлүүд: Сувгийн эмчилгээг шүдний сувагт
                          тохирсон зориулалтын нарийн багажнуудаар жижгээс
                          томруулах зарчимаар хийдэг эмчилгээ бөгөөд зарим
                          шүдний сурвалж анатомын онцлогоос хамаарч хэт далий
                          муруй, нарийн байснаас болж эмчийн ажиллах явцад
                          сувагт багаж хугарах, сурвалж цоорох, сурвалж, цөгц
                          хугарах, мэдээ алдуулах тарианд харшлах зэрэг эрсдлүүд
                          үүсч болно.
                        </div>

                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 10,
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!consentAnswersDraft?.acknowledged}
                            onChange={async (e) => {
                              updateConsentAnswers({
                                acknowledged: e.target.checked,
                              });
                              await saveConsentApi(consentTypeDraft);
                            }}
                          />
                          <span>
                            Өвчтөн / асран хамгаалагч танилцуулгыг бүрэн уншиж,
                            ойлгож зөвшөөрсөн.
                          </span>
                        </label>

                        <div
                          style={{
                            marginTop: 4,
                            paddingTop: 6,
                            borderTop: "1px dashed #e5e7eb",
                            fontSize: 12,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <div style={{ flex: "1 1 150px" }}>
                              <div
                                style={{
                                  marginBottom: 2,
                                  color: "#4b5563",
                                }}
                              >
                                Үйлчлүүлэгч / асран хамгаалагчийн нэр
                              </div>
                              <input
                                type="text"
                                value={consentAnswersDraft?.patientName || ""}
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    patientName: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                placeholder="Ж: Б. Болор"
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                }}
                              />
                            </div>

                            <div style={{ flex: "1 1 200px" }}>
                              <div
                                style={{
                                  marginBottom: 2,
                                  color: "#4b5563",
                                }}
                              >
                                Эмчилгээ хийсэн эмчийн нэр
                              </div>
                              <div>
                                <strong>
                                  {formatDoctorDisplayName(
                                    encounter.doctor
                                  )}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <div>
                            Огноо:{" "}
                            <strong>
                              {formatShortDate(encounter.visitDate)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {consentTypeDraft === "surgery" && (
                      <div>
                        <div
                          style={{
                            marginBottom: 8,
                            fontSize: 13,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>Сонголт:</span>
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <input
                              type="radio"
                              name="surgeryMode"
                              checked={
                                consentAnswersDraft?.surgeryMode !==
                                "PROCEDURE"
                              }
                              onChange={async () => {
                                updateConsentAnswers({
                                  surgeryMode: "SURGERY",
                                });
                                await saveConsentApi(consentTypeDraft);
                              }}
                            />
                            <span>Мэс засал</span>
                          </label>
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <input
                              type="radio"
                              name="surgeryMode"
                              checked={
                                consentAnswersDraft?.surgeryMode ===
                                "PROCEDURE"
                              }
                              onChange={async () => {
                                updateConsentAnswers({
                                  surgeryMode: "PROCEDURE",
                                });
                                await saveConsentApi(consentTypeDraft);
                              }}
                            />
                            <span>Мэс ажилбар</span>
                          </label>
                        </div>

                        {consentAnswersDraft?.surgeryMode === "PROCEDURE" ? (
                          <div>
                            <div
                              style={{
                                textAlign: "center",
                                fontWeight: 700,
                                fontSize: 14,
                                marginBottom: 8,
                              }}
                            >
                              МЭС АЖИЛБАР ХИЙЛГЭХ ТУХАЙ ЗӨВШӨӨРЛИЙН ХУУДАС
                            </div>

                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 12,
                                marginBottom: 6,
                              }}
                            >
                              А) МЭДЭЭЛЛИЙН ХУУДАС
                            </div>

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Санал болгож буй мэс ажилбарын нэр:
                            </label>
                            <textarea
                              value={consentAnswersDraft?.name || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  name: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={2}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Санал болгож буй мэс ажилбарын үр дүн (эмнэл
                              зүйн туршлагын дүн, нотолгоонд тулгуурлан
                              бүрэн эдгэрэлт, сайжралт, эндэгдэл,
                              хүндрэлийн магадлалыг хувиар илэрхийлэн
                              ойлгомжтойгоор тайлбарлана):
                            </label>
                            <textarea
                              value={consentAnswersDraft?.outcome || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  outcome: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Гарч болох эрсдлүүд (эрсдлүүдийг нэг бүрчлэн
                              дурдана):
                            </label>
                            <textarea
                              value={consentAnswersDraft?.risks || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  risks: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Гарч болох хүндрэлүүд (хүндрэлүүдийг нэг
                              бүрчлэн дурдана):
                            </label>
                            <textarea
                              value={consentAnswersDraft?.complications || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  complications: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Тухайн мэс ажилбарын үед хийгдэж болох нэмэлт
                              ажилбарууд (ажилбаруудыг нэг бүрчлэн дурдана):
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.additionalProcedures ||
                                ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  additionalProcedures: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Тухайн мэс ажилбар орлуулах боломжтой эмчилгээний
                              бусад аргууд (бусад аргуудыг дурдана):
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.alternativeTreatments ||
                                ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  alternativeTreatments: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Санал болгож буй мэс ажилбарын давуу тал:
                            </label>
                            <textarea
                              value={consentAnswersDraft?.advantages || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  advantages: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <div
                              style={{
                                marginTop: 4,
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 500,
                                  marginBottom: 2,
                                }}
                              >
                                Санал болгож буй мэс ажилбарын үед хийгдэх
                                мэдээгүйжүүлэлт:
                              </div>

                              {[
                                {
                                  key: "anesthesiaGeneral",
                                  label: "Ерөнхий",
                                },
                                {
                                  key: "anesthesiaSpinal",
                                  label: "Нугасны мэдээ алдуулалт",
                                },
                                {
                                  key: "anesthesiaLocal",
                                  label: "Хэсгийн мэдээ алдуулалт",
                                },
                                {
                                  key: "anesthesiaSedation",
                                  label: "Тайвшруулалт",
                                },
                              ].map((opt) => {
                                const checked =
                                  !!consentAnswersDraft?.[opt.key];
                                return (
                                  <label
                                    key={opt.key}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={async (e) => {
                                        updateConsentAnswers({
                                          [opt.key]: e.target.checked,
                                        });
                                        await saveConsentApi(
                                          consentTypeDraft
                                        );
                                      }}
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                );
                              })}
                            </div>

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Үйлчлүүлэгчээс тавьсан асуулт:
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.patientQuestions || ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  patientQuestions: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={2}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 4,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Дээрх асуултын товч:
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.questionSummary || ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  questionSummary: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={2}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Эмчтэй холбоо барих утас:
                            </label>
                            <input
                              type="text"
                              value={consentAnswersDraft?.doctorPhone || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  doctorPhone: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 8,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                marginBottom: 6,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={
                                  !!consentAnswersDraft?.doctorExplained
                                }
                                onChange={async (e) => {
                                  updateConsentAnswers({
                                    doctorExplained: e.target.checked,
                                  });
                                  await saveConsentApi(consentTypeDraft);
                                }}
                              />
                              <span>
                                Би үйлчлүүлэгчдээ дээрх мэдээллүүдийг
                                дэлгэрэнгүй, энгийн ойлгомжтой хэллэгээр
                                тайлбарлаж өгсөн болно.
                              </span>
                            </label>

                            <div
                              style={{
                                marginTop: 4,
                                paddingTop: 6,
                                borderTop: "1px dashed #e5e7eb",
                                fontSize: 12,
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 8,
                              }}
                            >
                              <div style={{ flex: "1 1 200px" }}>
                                Эмчийн нэр:{" "}
                                <strong>
                                  {formatDoctorDisplayName(
                                    encounter.doctor
                                  )}
                                </strong>
                              </div>
                              <div style={{ flex: "1 1 160px" }}>
                                Огноо:{" "}
                                <strong>
                                  {formatShortDate(
                                    encounter.visitDate
                                  )}
                                </strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div
                              style={{
                                textAlign: "center",
                                fontWeight: 700,
                                fontSize: 14,
                                marginBottom: 8,
                              }}
                            >
                              МЭС ЗАСАЛ ХИЙЛГЭХ ТУХАЙ ЗӨВШӨӨРЛИЙН ХУУДАС
                            </div>

                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 12,
                                marginBottom: 6,
                              }}
                            >
                              А) МЭДЭЭЛЛИЙН ХУУДАС
                            </div>

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Санал болгож буй мэс заслын нэр:
                            </label>
                            <textarea
                              value={consentAnswersDraft?.name || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  name: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={2}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Санал болгож буй мэс заслын үр дүн (эмнэл зүйн
                              туршлагын дүн, нотолгоонд тулгуурлан бүрэн
                              эдгэрэлт, сайжралт, эндэгдэл, хүндрэлийн
                              магадлалыг хувиар илэрхийлэн тайлбарлана):
                            </label>
                            <textarea
                              value={consentAnswersDraft?.outcome || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  outcome: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Гарч болох эрсдлүүд (эрсдлүүдийг нэг бүрчлэн
                              дурдана):
                            </label>
                            <textarea
                              value={consentAnswersDraft?.risks || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  risks: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Гарч болох хүндрэлүүд (хүндрэлүүдийг нэг
                              бүрчлэн дурдана):
                            </label>
                            <textarea
                              value={consentAnswersDraft?.complications || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  complications: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Тухайн мэс заслын үед хийгдэж болох нэмэлт
                              ажилбарууд:
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.additionalProcedures ||
                                ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  additionalProcedures: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Тухайн мэс заслыг орлуулах боломжтой бусад
                              эмчилгээний аргууд:
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.alternativeTreatments ||
                                ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  alternativeTreatments: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Санал болгож буй мэс заслын давуу тал:
                            </label>
                            <textarea
                              value={consentAnswersDraft?.advantages || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  advantages: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <div
                              style={{
                                marginTop: 4,
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 500,
                                  marginBottom: 2,
                                }}
                              >
                                Санал болгож буй мэс заслын үед хийгдэх
                                мэдээгүйжүүлэлт:
                              </div>

                              {[
                                {
                                  key: "anesthesiaGeneral",
                                  label: "Ерөнхий",
                                },
                                {
                                  key: "anesthesiaSpinal",
                                  label: "Нугасны мэдээ алдуулалт",
                                },
                                {
                                  key: "anesthesiaLocal",
                                  label: "Хэсгийн мэдээ алдуулалт",
                                },
                                {
                                  key: "anesthesiaSedation",
                                  label: "Тайвшруулалт",
                                },
                              ].map((opt) => {
                                const checked =
                                  !!consentAnswersDraft?.[opt.key];
                                return (
                                  <label
                                    key={opt.key}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={async (e) => {
                                        updateConsentAnswers({
                                          [opt.key]: e.target.checked,
                                        });
                                        await saveConsentApi(
                                          consentTypeDraft
                                        );
                                      }}
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                );
                              })}
                            </div>

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Үйлчлүүлэгчээс тавьсан асуулт:
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.patientQuestions || ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  patientQuestions: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={2}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 4,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Дээрх асуултын товч:
                            </label>
                            <textarea
                              value={
                                consentAnswersDraft?.questionSummary || ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  questionSummary: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={2}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 6,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Эмчтэй холбоо барих утас:
                            </label>
                            <input
                              type="text"
                              value={consentAnswersDraft?.doctorPhone || ""}
                              onChange={(e) =>
                                updateConsentAnswers({
                                  doctorPhone: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                marginBottom: 8,
                                fontSize: 12,
                              }}
                            />

                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                marginBottom: 6,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={
                                  !!consentAnswersDraft?.doctorExplained
                                }
                                onChange={async (e) => {
                                  updateConsentAnswers({
                                    doctorExplained: e.target.checked,
                                  });
                                  await saveConsentApi(consentTypeDraft);
                                }}
                              />
                              <span>
                                Би үйлчлүүлэгчдээ дээрх мэдээллүүдийг
                                дэлгэрэнгүй, энгийн ойлгомжтой хэллэгээр
                                тайлбарлаж өгсөн болно.
                              </span>
                            </label>

                            <div
                              style={{
                                marginTop: 4,
                                paddingTop: 6,
                                borderTop: "1px dashed #e5e7eb",
                                fontSize: 12,
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 8,
                              }}
                            >
                              <div style={{ flex: "1 1 200px" }}>
                                Эмчийн нэр:{" "}
                                <strong>
                                  {formatDoctorDisplayName(
                                    encounter.doctor
                                  )}
                                </strong>
                              </div>
                              <div style={{ flex: "1 1 160px" }}>
                                Огноо:{" "}
                                <strong>
                                  {formatShortDate(
                                    encounter.visitDate
                                  )}
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 6,
                            borderTop: "1px dashed #e5e7eb",
                            fontSize: 12,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 12,
                              marginBottom: 4,
                            }}
                          >
                            Б) ҮЙЛЧЛҮҮЛЭГЧИЙН ЗӨВШӨӨРӨЛ
                          </div>

                          <label
                            style={{
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                !!consentAnswersDraft?.patientConsentMain
                              }
                              onChange={async (e) => {
                                updateConsentAnswers({
                                  patientConsentMain: e.target.checked,
                                });
                                await saveConsentApi(consentTypeDraft);
                              }}
                              style={{ marginRight: 6 }}
                            />
                            Эмчийн санал болгож буй мэс засал / мэс
                            ажилбарыг дээрхи мэдээ алдуулалтаар хийлгэхийг
                            БИ ЗӨВШӨӨРЧ БАЙНА. Түүнчлэн гэмтсэн эд,
                            эрхтний хэсэг болон эд эрхтнийг журмын дагуу
                            устгахыг уг эмнэлэгт зөвшөөрч байна.
                          </label>

                          <label
                            style={{
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                !!consentAnswersDraft?.patientConsentInfo
                              }
                              onChange={async (e) => {
                                updateConsentAnswers({
                                  patientConsentInfo: e.target.checked,
                                });
                                await saveConsentApi(consentTypeDraft);
                              }}
                              style={{ marginRight: 6 }}
                            />
                            Мэс засал / мэс ажилбарын үр дүн, гарч болох
                            хүндрэл, эрсдэл, нэмэлт ажилбарууд, орлуулж
                            болох эмчилгээний талаар БИ тодорхой мэдээлэл
                            авсан болно.
                          </label>

                          <div
                            style={{
                              marginTop: 6,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  marginBottom: 2,
                                  color: "#4b5563",
                                }}
                              >
                                Үйлчлүүлэгчийн нэр (гарын үсгийн талбарын
                                оронд):
                              </div>
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft
                                    ?.patientSignatureName || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    patientSignatureName:
                                      e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                }}
                              />
                            </div>

                            <div>
                              <div
                                style={{
                                  marginBottom: 2,
                                  color: "#4b5563",
                                }}
                              >
                                Асран хамгаалагч / харгалзан дэмжигчийн нэр
                                (хэрэв үйлчлүүлэгч эрх зүйн чадамжгүй бол):
                              </div>
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.guardianName || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    guardianName: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                  marginBottom: 4,
                                }}
                              />

                              <input
                                type="text"
                                placeholder="Холбоо, хамаарал ( нөхөр, аав, ээж гэх мэт)"
                                value={
                                  consentAnswersDraft
                                    ?.guardianRelationDescription ||
                                  ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    guardianRelationDescription:
                                      e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                }}
                              />
                            </div>

                            <div>
                              <div
                                style={{
                                  marginBottom: 2,
                                  color: "#4b5563",
                                }}
                              >
                                Үйлчлүүлэгч эрх зүйн чадамжгүй байгаа
                                шалтгаан:
                              </div>
                              {[
                                "minor",
                                "unconscious",
                                "mentalDisorder",
                                "other",
                              ].map((key) => {
                                const labels: Record<string, string> = {
                                  minor: "Насанд хүрээгүй",
                                  unconscious: "Ухаангүй",
                                  mentalDisorder: "Сэтгэцийн эмгэгтэй",
                                  other: "Бусад (тайлбарлана уу)",
                                };
                                const checked =
                                  !!consentAnswersDraft?.incapacityReason?.[
                                    key
                                  ];
                                return (
                                  <label
                                    key={key}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 2,
                                      fontSize: 12,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const prev =
                                          consentAnswersDraft
                                            ?.incapacityReason || {};
                                        updateConsentAnswers({
                                          incapacityReason: {
                                            ...prev,
                                            [key]: e.target.checked,
                                          },
                                        });
                                      }}
                                      onBlur={async () => {
                                        await saveConsentApi(
                                          consentTypeDraft
                                        );
                                      }}
                                    />
                                    <span>{labels[key]}</span>
                                  </label>
                                );
                              })}

                              <textarea
                                placeholder="Бусад шалтгааны тайлбар"
                                value={
                                  consentAnswersDraft?.incapacityReason
                                    ?.otherText || ""
                                }
                                onChange={(e) => {
                                  const prev =
                                    consentAnswersDraft?.incapacityReason ||
                                    {};
                                  updateConsentAnswers({
                                    incapacityReason: {
                                      ...prev,
                                      otherText: e.target.value,
                                    },
                                  });
                                }}
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                rows={2}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                  marginTop: 2,
                                  fontSize: 12,
                                }}
                              />
                            </div>

                            <div
                              style={{
                                marginTop: 6,
                                paddingTop: 6,
                                borderTop: "1px dashed #e5e7eb",
                              }}
                            >
                              <div
                                style={{
                                  marginBottom: 4,
                                  color: "#4b5563",
                                  fontSize: 12,
                                }}
                              >
                                Хэрэв өвчтөн жирэмсэн тохиолдолд:
                              </div>
                              <label
                                style={{
                                  display: "block",
                                  marginBottom: 4,
                                  fontSize: 12,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    !!consentAnswersDraft?.husbandConsent
                                  }
                                  onChange={async (e) => {
                                    updateConsentAnswers({
                                      husbandConsent: e.target.checked,
                                    });
                                    await saveConsentApi(consentTypeDraft);
                                  }}
                                  style={{ marginRight: 6 }}
                                />
                                Миний эхнэрийн хийлгэхээр зөвшөөрсөн мэс
                                ажилбар / мэс заслыг би зөвшөөрч байна.
                              </label>

                              <div
                                style={{
                                  marginBottom: 2,
                                  color: "#4b5563",
                                }}
                              >
                                Нөхрийн нэр:
                              </div>
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.husbandName || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    husbandName: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1pxsolid #d1d5db",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                  marginBottom: 4,
                                }}
                              />

                              <textarea
                                placeholder="Хэрэв нөхөр / асран хамгаалагч / харгалзан дэмжигч нь зөвшөөрөөгүй бол тайлбарлана уу."
                                value={
                                  consentAnswersDraft
                                    ?.husbandRefuseReason || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    husbandRefuseReason: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                rows={2}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                }}
                              />
                            </div>

                            <div style={{ marginTop: 6, fontSize: 12 }}>
                              Огноо:{" "}
                              <strong>
                                {formatShortDate(encounter.visitDate)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {consentTypeDraft === "orthodontic" && (
                      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                        <div
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 8,
                          }}
                        >
                          Шүд эрүүний гажиг заслын эмчилгээ хийлгэх өвчтөний
                          зөвшөөрлийн хуудас
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          Нүүр амны гажиг заслын эмчилгээ хийлгэснээр таны:
                          <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                            <li>
                              Амыг хөндийд эрүүл ахуйн байдал (шүдний цоорол,
                              тулгуур эдийн өвчлөлийг багасгана.)
                            </li>
                            <li>Нүүрний гадаад төрх</li>
                            <li>Өөртөө итгэх үнэлэмж</li>
                            <li>Үйл зүйн тохирлын байдал сайжирна.</li>
                          </ul>
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          Нүүр амны гажиг заслын эмчилгээний үр дүн нь эмч
                          өвчтөний хамтын үйл ажиллагаанаас шууд хамаарадаг ба
                          өвчтөн эмчийн заавар, зөвлөгөөг дагаж мөрдөх
                          шаардлагатай. Учир нь өвчтөн эмчийн заавар
                          зөвлөгөөг мөрдөөгүй улмаас эмчилгээний явцад тодорхой
                          хүндрэлүүд гарах боломжтой. Гажиг заслын эмчилгээг нь
                          олон улсын мөрдөдөг эмчилгээний стандартыг дагуу
                          төлөвлөгдөн эхэлдэг боловч нэр бүрийн хүчин зүйлээс
                          шалтгаалж үйлчлүүлэгч болон эмчилгээний үр дүн
                          харилцан адилгүй, мөн хүссэн хэмжээнд хүрэхгүй байх
                          ч тохиолдол гардаг. Иймээс эмчилгээний үр дүнг тэр
                          болгог урьдчилан мэдэх боломжгүй тул баталгааг
                          өгдөггүй. Гажиг заслын эмчилгээгээр шүдний механик
                          хүч ашиглан шүдүүдийг хөдөлгөн зуултыг засдаг бөгөөд
                          зажлах, ярьж, залгих, үлээх үйлдлийн давтамжаас
                          хамаарч тухайн хүч нь яс, сурвалж, буйл, шүдний тулгуур
                          эд болон эрүүл үенд ачаалал өгдөг юм.
                        </div>

                        <div style={{ marginBottom: 8 }}>
                          Анагаах ухааны салбарт эмчилгээг болон өөрийн
                          хэрэгсэл эрсдэл дагуулдаг бөгөөд зөвхөн нэг шүд
                          эрүүний гажиг заслын эмчилгээний явцад дараах
                          хүндрэлүүд гарч болзошгүй.
                        </div>

                        <ol style={{ paddingLeft: 20, marginBottom: 8 }}>
                          <li>
                            Өвчтөн шүдээ тогтмол угаахгүй байх, нүүрс-ус болон
                            чихэрний агууламж өндөртэй хүнсний
                            бүтээгдэхүүнүүд хэрэглэхээс шүд эрдэсгүйтэн
                            цоорох, буйл үрэвсэх. Үүний улмаас шүдийг 1 удаа
                            фтортуулах шаардлагатай байж болно.
                          </li>
                          <li>
                            Эмчилгээний явцад зарим өвчтөнүүдийн шүдний
                            сурвалж богиносож, яс нь бага хэмжээгээр шимэгдэж
                            болно. Харин өвчтөний наснаас хамааран (25 наснаас
                            дээш) шүд суух, буйл шамарч, шүд хөдөлгөөнтэй болох
                            хүндрэлүүд гарч болзошгүй.
                          </li>
                          <li>
                            Амны хөндийн эрүүл ахуй дутуу сахиснаар буйл
                            болон шүдний холбоос эдээр халдвар дамжиж, шүдийг
                            тойрон хүрээлсэн тулгуур эд гэмтэх, улмаар шүд
                            хөдөлгөөнтэй болох эрсдэлтэй.
                          </li>
                          <li>
                            Эмчилгээний дараа бэхжүүлэх зэмсгийг тогтмол
                            зүүхгүй байх, зажлах зуршил буруу хэвээр байх,
                            амьсгалаа амаар авах, зуршлын өөрчлөлт хийхгүй байх
                            зэрэг нь гажиг давтан үүсэх шалтгаан болдог.
                          </li>
                        </ol>

                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 6,
                            borderTop: "1px dashed #e5e7eb",
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: 4,
                            }}
                          >
                            Сонгож хийх боломж
                          </div>

                          <div style={{ marginBottom: 8 }}>
                            Гажиг заслын эмчилгээ хийлгэх нь хувь хүний
                            сонголт юм. Иймээс зарим өвчтөн эмчилгээний явцад
                            өөрийн шүдний байрлал, зуулт, бүтэц, нүүрний
                            гадаад үзэмж зэрэгт сэтгэл ханамжтай байх
                            тохиолдолд эмчилгээг дуусгалгүй орхих боломжтой.
                            Энэ нь өвчтөний сонголт юм. Жишээ нь: шүд
                            авахуулах/хийгээр засуулах, эрүү нүүрний мэс засал
                            хийлгэхгүй байх, хиймэл шүд хийлгэх зэргийг гажиг
                            заслын эмчилгээ эхлэхээс өмнө эмчтэй зөвлөж
                            сонголтоо хийх хэрэгтэй.
                          </div>

                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: 4,
                            }}
                          >
                            Төлбөр тооцоо
                          </div>

                          <ol style={{ paddingLeft: 20 }}>
                            <li>
                              Гажиг заслын эмчилгээний зэмсгийн төлбөр нь
                              таны сонголтоос хамаарна.
                            </li>
                            <li>
                              Өвчтөн сар бүр давтан үзүүлэхэд{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoMonthlyFee || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoMonthlyFee: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөгийн төлбөр төлнө.
                            </li>
                            <li>
                              Зэмсэг унасан, гэмтсэн тохиолдолд зэмсгээс
                              хамааран{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoBrokenFee || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoBrokenFee: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1pxsolid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөг нэмж төлнө.
                            </li>
                            <li>
                              Гажиг заслын эмчилгээний үр дүнг бэхжүүлэх
                              зэмсэг нь{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoRetainerFee ||
                                  ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoRetainerFee: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөг байна.
                            </li>
                          </ol>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 6,
                            borderTop: "1px dashed #e5e7eb",
                            marginBottom: 8,
                          }}
                        >
                          <ol start={6} style={{ paddingLeft: 20 }}>
                            <li>
                              Гажиг заслын эмчилгээний явцад хэрэглэгдэх
                              нэмэлт тоноглолууд (hook, open coil, stopper,
                              torque spring, button, band г.м) тус бүр{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoAccessoryFee ||
                                  ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoAccessoryFee: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөгийн төлбөртэй.
                            </li>
                            <li>
                              Эмчилгээний явцад ирэхгүй 3 сар тутамд нэмэлт
                              төлбөр{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoNoShowFee3m ||
                                  ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoNoShowFee3m: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөг бодогдоно.
                            </li>
                            <li>
                              6 сар болон түүнээс дээш хугацаагаар
                              эмчилгээндээ ирэхгүй тохиолдолд рентген зураг
                              дахин авч оношлогоо дахин хийнэ. Эмчилгээний
                              төлбөр нэмэлт{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoNoShowFee6m ||
                                  ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoNoShowFee6m: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөг байна.
                            </li>
                            <li>
                              9 болон түүнээс дээш сараар эмчилгээндээ ирэхгүй
                              бол нэмэлт төлбөр{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft
                                    ?.orthoNoShowFee9mOrMore || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoNoShowFee9mOrMore:
                                      e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              авч эмчилгээг дахин эхлүүлнэ.
                            </li>
                            <li>
                              1 жил буюу түүнээс дээш хугацаагаар
                              эмчилгээндээ ирэхгүй тохиолдолд гажиг заслын
                              эмчилгээг зогсоож, ахин шинээр хийлгэх
                              эмчилгээг дахин эхлүүлнэ.
                            </li>
                            <li>
                              Гажиг заслын авхдагтай зэмсэг зүүх хугацаанд 6
                              сар тутам, эмчилгээ дууссаны дараа рентген
                              зураг авах ба 1 рентген зургийн төлбөр{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoXrayFee || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoXrayFee: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 80,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 4px",
                                  fontSize: 12,
                                }}
                              />{" "}
                              төгрөг байна.
                            </li>
                            <li>
                              12.{" "}
                              <textarea
                                placeholder="Эмчийн нэмэлт тэмдэглэл / тусгай нөхцөл"
                                value={
                                  consentAnswersDraft?.orthoExtraNotes || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoExtraNotes: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                rows={2}
                                style={{
                                  width: "100%",
                                  borderRadius: 6,
                                  border: "1px solid #d1d5db",
                                  padding: "4px 6px",
                                  fontSize: 12,
                                  marginTop: 4,
                                }}
                              />
                            </li>
                          </ol>

                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                            }}
                          >
                            Танилцуулсан зөвшөөрлийг уншиж зөвшөөрсөн
                            өвчтөн/асран хамгаалагчийн нэр{" "}
                            <input
                              type="text"
                              placeholder="нэр"
                              value={
                                consentAnswersDraft
                                  ?.orthoPatientAgreeName || ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  orthoPatientAgreeName: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              style={{
                                minWidth: 80,
                                borderRadius: 4,
                                border: "1px solid #d1d5db",
                                padding: "0 4px",
                                fontSize: 12,
                              }}
                            />
                            <br />
                            Эмчилгээ хийж буй эмчийн нэр{" "}
                            <strong>
                              {formatDoctorDisplayName(encounter.doctor)}
                            </strong>
                            <div style={{ marginTop: 4 }}>
                              Огноо:{" "}
                              <strong>
                                {formatShortDate(encounter.visitDate)}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 8,
                            borderTop: "1px dashed #e5e7eb",
                          }}
                        >
                          <div
                            style={{
                              textAlign: "center",
                              fontWeight: 600,
                              fontSize: 13,
                              marginBottom: 8,
                            }}
                          >
                            Эмчилгээний танилцуулга гэрээ
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 16,
                              marginBottom: 8,
                            }}
                          >
                            <div>
                              Овог:{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoIntroOvog || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoIntroOvog: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 140,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 6px",
                                  fontSize: 12,
                                }}
                              />
                            </div>
                            <div>
                              Нэр:{" "}
                              <input
                                type="text"
                                value={
                                  consentAnswersDraft?.orthoIntroName || ""
                                }
                                onChange={(e) =>
                                  updateConsentAnswers({
                                    orthoIntroName: e.target.value,
                                  })
                                }
                                onBlur={async () => {
                                  await saveConsentApi(consentTypeDraft);
                                }}
                                style={{
                                  minWidth: 140,
                                  borderRadius: 4,
                                  border: "1px solid #d1d5db",
                                  padding: "0 6px",
                                  fontSize: 12,
                                }}
                              />
                            </div>
                            <div>
                              Огноо:{" "}
                              <strong>
                                {formatShortDate(encounter.visitDate)}
                              </strong>
                            </div>
                          </div>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              marginBottom: 6,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                !!consentAnswersDraft
                                  ?.orthoIntroDoctorExplained
                              }
                              onChange={async (e) => {
                                updateConsentAnswers({
                                  orthoIntroDoctorExplained:
                                    e.target.checked,
                                });
                                await saveConsentApi(consentTypeDraft);
                              }}
                            />
                            <span>
                              Хийгдэхээр төлөвлөгдсөн эмчилгээ болон түүнээс
                              гарч болох хүндрэлүүдийг эмч тайлбарлаж өгсөн
                              болно.
                            </span>
                          </label>

                          <div
                            style={{
                              fontSize: 12,
                              marginBottom: 6,
                            }}
                          >
                            НАС сургуулийн НAСЭ-т сургалт, эрдэм
                            шинжилгээ, эмчилгээ, үйлчилгээ зэрэг явагддаг тул
                            нэгдсэн багээр (эмч, багш, резидент эмч,
                            оюутнууд хамтран) үзлэг, эмчилгээ хийхийг
                            зөвшөөрч байна.
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 16,
                              marginBottom: 8,
                              fontSize: 12,
                            }}
                          >
                            <div>
                              Эмчийн нэр:{" "}
                              <strong>
                                {formatDoctorDisplayName(encounter.doctor)}
                              </strong>
                            </div>

                          </div>

                          <div style={{ marginBottom: 6 }}>
                            <div
                              style={{
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Үйлчлүүлэгчийн асуусан асуулт:
                            </div>
                            <textarea
                              value={
                                consentAnswersDraft
                                  ?.orthoIntroPatientQuestions || ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  orthoIntroPatientQuestions:
                                    e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1pxsolид #d1d5db",
                                padding: "4px 6px",
                                fontSize: 12,
                              }}
                            />
                          </div>

                          <div style={{ marginBottom: 6 }}>
                            <div
                              style={{
                                fontWeight: 500,
                                marginBottom: 2,
                              }}
                            >
                              Эмчийн хариулт:
                            </div>
                            <textarea
                              value={
                                consentAnswersDraft?.orthoIntroDoctorAnswer ||
                                ""
                              }
                              onChange={(e) =>
                                updateConsentAnswers({
                                  orthoIntroDoctorAnswer: e.target.value,
                                })
                              }
                              onBlur={async () => {
                                await saveConsentApi(consentTypeDraft);
                              }}
                              rows={3}
                              style={{
                                width: "100%",
                                borderRadius: 6,
                                border: "1px solid #d1d5db",
                                padding: "4px 6px",
                                fontSize: 12,
                              }}
                            />
                          </div>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              marginTop: 6,
                              marginBottom: 4,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                !!consentAnswersDraft
                                  ?.orthoIntroPatientUnderstood
                              }
                              onChange={async (e) => {
                                updateConsentAnswers({
                                  orthoIntroPatientUnderstood:
                                    e.target.checked,
                                });
                                await saveConsentApi(consentTypeDraft);
                              }}
                            />
                            <span>
                              Хийлгэх эмчилгээний талаар дэлгэрэнгүй
                              тайлбар авсан бөгөөд энэхүү эмчилгээг хийлгэхийг
                              зөвшөөрч байна.
                            </span>
                          </label>


                        </div>
                      </div>
                    )}

                    {consentTypeDraft === "prosthodontic" && (
                      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                        <div
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 12,
                          }}
                        >
                          НАСЗ заслын эмчилгээний танилцуулах зөвшөөрөл
                        </div>

                        <textarea
                          placeholder="Эмчилгээний ерөнхий тайлбар, зорилго, онцлог..."
                          value={consentAnswersDraft?.prosthoIntroText || ""}
                          onChange={(e) =>
                            updateConsentAnswers({
                              prosthoIntroText: e.target.value,
                            })
                          }
                          onBlur={async () => {
                            await saveConsentApi(consentTypeDraft);
                          }}
                          rows={3}
                          style={{
                            width: "100%",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                        />

                        <div
                          style={{
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          Хоёрдох удаагийн ирэлтээр:
                        </div>
                        <textarea
                          value={
                            consentAnswersDraft?.prosthoSecondVisit || ""
                          }
                          onChange={(e) =>
                            updateConsentAnswers({
                              prosthoSecondVisit: e.target.value,
                            })
                          }
                          onBlur={async () => {
                            await saveConsentApi(consentTypeDraft);
                          }}
                          rows={2}
                          style={{
                            width: "100%",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                        />

                        <div
                          style={{
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          Эмчилгээний сул тал:
                        </div>
                        <textarea
                          value={consentAnswersDraft?.prosthoWeakPoints || ""}
                          onChange={(e) =>
                            updateConsentAnswers({
                              prosthoWeakPoints: e.target.value,
                            })
                          }
                          onBlur={async () => {
                            await saveConsentApi(consentTypeDraft);
                          }}
                          rows={2}
                          style={{
                            width: "100%",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                        />

                        <div
                          style={{
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          Эмчилгээний явц:
                        </div>
                        <textarea
                          value={consentAnswersDraft?.prosthoCourse || ""}
                          onChange={(e) =>
                            updateConsentAnswers({
                              prosthoCourse: e.target.value,
                            })
                          }
                          onBlur={async () => {
                            await saveConsentApi(consentTypeDraft);
                          }}
                          rows={2}
                          style={{
                            width: "100%",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                        />

                        <div
                          style={{
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          Эмчилгээний үнэ өртөг:
                        </div>
                        <textarea
                          value={consentAnswersDraft?.prosthoCost || ""}
                          onChange={(e) =>
                            updateConsentAnswers({
                              prosthoCost: e.target.value,
                            })
                          }
                          onBlur={async () => {
                            await saveConsentApi(consentTypeDraft);
                          }}
                          rows={2}
                          style={{
                            width: "100%",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                        />

                        <div
                          style={{
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          Танилцах зөвшөөрлийг уншиж танилцсан:
                        </div>
                        <textarea
                          value={
                            consentAnswersDraft?.prosthoAcknowledgement || ""
                          }
                          onChange={(e) =>
                            updateConsentAnswers({
                              prosthoAcknowledgement: e.target.value,
                            })
                          }
                          onBlur={async () => {
                            await saveConsentApi(consentTypeDraft);
                          }}
                          rows={2}
                          style={{
                            width: "100%",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginBottom: 12,
                          }}
                        />

                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ marginBottom: 6 }}>
                            Эмчлэгч эмч:{" "}
                            <strong>
                              {formatDoctorDisplayName(encounter.doctor)}
                            </strong>
                          </div>

                          <div>
                            Огноо:{" "}
                            <strong>
                              {formatShortDate(encounter.visitDate)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void saveCurrentConsent()}
                      disabled={consentSaving}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #16a34a",
                        background: "#ecfdf3",
                        color: "#166534",
                        fontSize: 12,
                        cursor: consentSaving ? "default" : "pointer",
                      }}
                    >
                      {consentSaving
                        ? "Хадгалж байна..."
                        : "Зөвшөөрлийн хуудас хадгалах"}
                    </button>
                  </div>

                  {/* Shared signature section for all consent types */}
                  <div className="mt-4 pt-3 border-t border-dashed border-gray-200">
                    <h3 className="text-sm font-semibold mb-2">
                      Гарын үсэг (бүх зөвшөөрлийн маягтад хамаарна)
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Энэ гарын үсэг нь 4 төрлийн зөвшөөрлийн маягтад хамтдаа хэрэглэгдэнэ.
                    </p>

                    <div className="grid grid-cols-2 gap-4 p-3 border border-gray-200 rounded-lg bg-gray-50">
                      {/* Patient signature */}
                      <div>
                        <div className="text-xs font-medium mb-2">
                          Өвчтөн/асран хамгаалагчийн гарын үсэг
                        </div>
                        {encounter.patientSignaturePath ? (
                          <div>
                            <img
                              src={encounter.patientSignaturePath}
                              alt="Patient signature"
                              className="max-w-full h-auto border border-gray-300 rounded bg-white"
                            />
                            {encounter.patientSignedAt && (
                              <div className="text-[11px] text-gray-500 mt-1">
                                Гарын үсэг зурсан:{" "}
                                {formatDateTime(encounter.patientSignedAt)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <SignaturePad
                              ref={patientSigRef}
                              disabled={uploadingPatientSignature}
                            />
                            <button
                              type="button"
                              disabled={uploadingPatientSignature}
                              onClick={async () => {
                                if (!patientSigRef.current?.hasDrawn()) {
                                  alert("Гарын үсэг зураагүй байна.");
                                  return;
                                }
                                const blob = await patientSigRef.current.getBlob();
                                if (blob) void onPatientSignatureUpload(blob);
                              }}
                              className={`mt-1.5 px-2.5 py-1 rounded border border-green-600 bg-green-50 text-green-800 text-xs ${uploadingPatientSignature ? "cursor-default" : "cursor-pointer"}`}
                            >
                              {uploadingPatientSignature ? "Хадгалж байна..." : "Гарын үсэг хадгалах"}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Doctor signature */}
                      <div>
                        <div className="text-xs font-medium mb-2">
                          Эмчийн гарын үсэг
                        </div>
                        {encounter.doctorSignaturePath ? (
                          <div>
                            <img
                              src={encounter.doctorSignaturePath}
                              alt="Doctor signature"
                              className="max-w-full h-auto border border-gray-300 rounded bg-white"
                            />
                            {encounter.doctorSignedAt && (
                              <div className="text-[11px] text-gray-500 mt-1">
                                Холбосон:{" "}
                                {formatDateTime(encounter.doctorSignedAt)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="mb-2">
                              <SignaturePad
                                ref={doctorSigRef}
                                disabled={uploadingDoctorSignature}
                              />
                              <button
                                type="button"
                                disabled={uploadingDoctorSignature}
                                onClick={async () => {
                                  if (!doctorSigRef.current?.hasDrawn()) {
                                    alert("Гарын үсэг зураагүй байна.");
                                    return;
                                  }
                                  const blob = await doctorSigRef.current.getBlob();
                                  if (blob) void onDoctorSignatureUpload(blob);
                                }}
                                className={`mt-1.5 px-2.5 py-1 rounded border border-green-600 bg-green-50 text-green-800 text-xs ${uploadingDoctorSignature ? "cursor-default" : "cursor-pointer"}`}
                              >
                                {uploadingDoctorSignature ? "Хадгалж байна..." : "Гарын үсэг хадгалах"}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                              <span>эсвэл</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void onAttachDoctorSignature()}
                              disabled={
                                attachingDoctorSignature ||
                                !encounter.doctor?.signatureImagePath
                              }
                              className={`mt-2 px-4 py-2 rounded border border-blue-600 bg-blue-50 text-blue-600 text-xs ${attachingDoctorSignature || !encounter.doctor?.signatureImagePath ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                            >
                              {attachingDoctorSignature
                                ? "Холбож байна..."
                                : "Эмчийн гарын үсэг холбох"}
                            </button>
                            {!encounter.doctor?.signatureImagePath && (
                              <div className="text-[11px] text-red-700 mt-1">
                                Эмчийн профайлд гарын үсэг байхгүй байна
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {encounter.notes && (
                <div style={{ marginTop: 4 }}>
                  <strong>Тэмдэглэл:</strong> {encounter.notes}
                </div>
              )}
            </div>
    </>
  );
}
