import React, { useState } from "react";
import NurseIncomeDetails from "./NurseIncomeDetails";

function getDefaultIncomeDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const mm = String(month + 1).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

interface Props {
  /**
   * Nurse ID — used for the admin API URL when apiBaseUrl is not provided.
   * Not required when using apiBaseUrl (nurse portal).
   * At least one of nurseId or apiBaseUrl must be provided.
   */
  nurseId?: number;
  /**
   * Optional override for the income details API base URL.
   * When provided, fetches from `${apiBaseUrl}?startDate=...&endDate=...`
   * Use this for the nurse portal: `/api/nurse/income/details`
   * At least one of nurseId or apiBaseUrl must be provided.
   */
  apiBaseUrl?: string;
}

/**
 * NurseIncomeView — shared date-picker + income details component.
 * Used by:
 *   - Admin nurse profile income tab (pass nurseId)
 *   - Nurse portal income page (pass apiBaseUrl="/api/nurse/income/details")
 */
export default function NurseIncomeView({ nurseId, apiBaseUrl }: Props) {
  const [incomeInputStart, setIncomeInputStart] = useState(
    () => getDefaultIncomeDates().start
  );
  const [incomeInputEnd, setIncomeInputEnd] = useState(
    () => getDefaultIncomeDates().end
  );
  const [incomeStart, setIncomeStart] = useState(
    () => getDefaultIncomeDates().start
  );
  const [incomeEnd, setIncomeEnd] = useState(
    () => getDefaultIncomeDates().end
  );

  return (
    <>
      <h2 className="text-base font-bold mb-3">
        Сувилагчийн орлогын дэлгэрэнгүй
      </h2>
      <div className="flex items-end gap-3 mb-5 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Эхлэх огноо
          </label>
          <input
            type="date"
            value={incomeInputStart}
            onChange={(e) => setIncomeInputStart(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Дуусах огноо
          </label>
          <input
            type="date"
            value={incomeInputEnd}
            onChange={(e) => setIncomeInputEnd(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setIncomeStart(incomeInputStart);
            setIncomeEnd(incomeInputEnd);
          }}
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm cursor-pointer hover:bg-blue-700"
        >
          Харах
        </button>
      </div>
      <NurseIncomeDetails
        nurseId={nurseId}
        startDate={incomeStart}
        endDate={incomeEnd}
        apiBaseUrl={apiBaseUrl}
      />
    </>
  );
}
