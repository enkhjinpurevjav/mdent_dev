import React from "react";
import Link from "next/link";
import type { Encounter, Branch, WarningLine } from "../../types/encounter-admin";
import {
  formatPatientName,
  formatDoctorDisplayName,
  formatStaffName,
} from "../../utils/name-formatters";
import { formatShortDate } from "../../utils/date-formatters";
import { displayOrDash } from "../../utils/display-helpers";

type PatientHeaderProps = {
  encounter: Encounter;
  warningLines: WarningLine[];
  nursesForEncounter: {
    nurseId: number;
    name?: string | null;
    ovog?: string | null;
    email: string;
    phone?: string | null;
    schedules: {
      id: number;
      date: string;
      branch: Branch;
      startTime: string;
      endTime: string;
      note?: string | null;
    }[];
  }[];
  changingNurse: boolean;
  onChangeNurse: (nurseIdStr: string) => void;
  hideMiniNav?: boolean;
  showPatientDetailsButton?: boolean;
};

export default function PatientHeader({
  encounter,
  warningLines,
  nursesForEncounter,
  changingNurse,
  onChangeNurse,
  hideMiniNav,
  showPatientDetailsButton,
}: PatientHeaderProps) {
  const bookNumber = encodeURIComponent(encounter.patientBook.bookNumber);

  const navItems = [
    { label: "Профайл", href: `/patients/${bookNumber}?tab=profile` },
    { label: "Үйлчлүүлэгчийн карт", href: `/patients/${bookNumber}?tab=patient_history` },
    { label: "Цагууд", href: `/patients/${bookNumber}?tab=appointments` },
    { label: "Карт бөглөх", href: `/patients/${bookNumber}?tab=visit_card` },
    { label: "Гажиг заслын карт", href: `/patients/${bookNumber}?tab=ortho_card` },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-[2fr_1fr]">
      {/* Left card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-lg font-semibold mb-1">
          {formatPatientName(encounter.patientBook.patient)}
        </div>

        <div className="text-[13px] text-gray-500">
          Картын дугаар: {encounter.patientBook.bookNumber}
        </div>

        {encounter.patientBook.patient.regNo && (
          <div className="text-[13px] text-gray-500">
            РД: {encounter.patientBook.patient.regNo}
          </div>
        )}

        <div className="text-[13px] text-gray-500">
          Утас: {displayOrDash(encounter.patientBook.patient.phone)}
        </div>

        <div className="text-[13px] text-gray-500 mb-2">
          Бүртгэсэн салбар:{" "}
          {encounter.patientBook.patient.branch?.name ||
            encounter.patientBook.patient.branchId}
        </div>

        {!hideMiniNav && (
          <nav className="mt-2 flex flex-wrap border-b-2 border-gray-200">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-block whitespace-nowrap px-3 py-1.5 text-xs text-gray-500 border-b-2 border-transparent -mb-[2px] hover:text-blue-700 hover:border-blue-500"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {showPatientDetailsButton && (
          <div className="mt-2">
            <a
              href={`/patients/${bookNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
            >
              Үйлчлүүлэгчийн дэлгэрэнгүй
            </a>
          </div>
        )}
      </div>

      {/* Right card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Огноо</div>
          <div className="text-sm font-medium">{formatShortDate(encounter.visitDate)}</div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-0.5">Эмч</div>
          <div className="text-sm">{formatDoctorDisplayName(encounter.doctor)}</div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-0.5">Сувилагч</div>
          <select
            value={encounter.nurseId || ""}
            onChange={(e) => onChangeNurse(e.target.value)}
            disabled={changingNurse}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-[13px] disabled:opacity-60"
          >
            <option value="">Сонгоогүй</option>
            {nursesForEncounter.map((n) => (
              <option key={n.nurseId} value={n.nurseId}>
                {formatStaffName({
                  name: n.name || undefined,
                  ovog: n.ovog || undefined,
                  email: n.email,
                })}
              </option>
            ))}
          </select>
        </div>

        {warningLines.length > 0 && (
          <div className="mt-1 rounded-lg border border-orange-400 bg-orange-50 p-2">
            <div className="text-[13px] font-bold text-red-700 mb-1">
              Анхаарах!
            </div>
            <ul className="m-0 pl-4 text-xs text-red-900">
              {warningLines.map((w, idx) => (
                <li key={`${w.label}-${idx}`} className="mb-0.5">
                  {w.label} ({w.value})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
