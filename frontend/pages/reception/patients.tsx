// frontend/pages/reception/patients.tsx
// Reception portal — patient list page.
// ReceptionLayout is applied globally by _app.tsx for /reception/* routes.
// Receptionist can create and edit patients but NOT delete.
// Delete is hidden in UI; backend also enforces 403 for DELETE.

import PatientsIndexPage from "../../components/patients/PatientsIndexPage";

export default function ReceptionPatientsPage() {
  return (
    <PatientsIndexPage
      showSummaryCards={false}
      patientProfileBasePath="/reception/patients"
      isReceptionContext
      containerClassName="w-full px-3 sm:px-4 lg:px-6 py-4 font-sans"
    />
  );
}
