import NurseProfileSummaryView from "../../components/nurses/NurseProfileSummaryView";

export default function ReceptionProfilePage() {
  return (
    <NurseProfileSummaryView
      meUrl="/api/reception/me"
      showLogout={true}
      roleLabel="Ресепшн"
    />
  );
}
