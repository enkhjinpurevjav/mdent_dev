// frontend/pages/reception/bookings.tsx
// Reception portal — Захиалгын жагсаалт (Booking list).
// Uses the same visits-style UI as /visits, wrapped in ReceptionLayout.
// For receptionist role: branch selector is hidden; branchId is forced to own branch.
// For admin/super_admin: branch selector is shown as normal.

import React from "react";
import ReceptionLayout from "../../components/ReceptionLayout";
import VisitsListPage from "../../components/pages/VisitsListPage";

export default function ReceptionBookingsPage() {
  return (
    <ReceptionLayout>
      <VisitsListPage hideBranchSelector />
    </ReceptionLayout>
  );
}
