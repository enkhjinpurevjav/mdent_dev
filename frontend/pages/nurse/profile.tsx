import NurseProfileSummaryView from "../../components/nurses/NurseProfileSummaryView";

export default function NurseProfilePage() {
  return (
    <NurseProfileSummaryView
      meUrl="/api/nurse/me"
      showLogout={true}
    />
  );
}
