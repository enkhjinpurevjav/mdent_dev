import PatientsIndexPage from "../components/patients/PatientsIndexPage";

export default function PatientsPage() {
  return (
    <PatientsIndexPage
      showSummaryCards
      patientProfileBasePath="/patients"
      containerClassName="max-w-7xl px-4 lg:px-8 my-4 font-sans"
    />
  );
}
