import NurseScheduleView from "../../components/nurses/NurseScheduleView";

export default function NurseSchedulePage() {
  return (
    <NurseScheduleView
      scheduleUrl="/api/nurse/schedule"
      historyUrl="/api/nurse/schedule"
    />
  );
}
