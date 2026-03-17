import NurseScheduleView from "../../components/nurses/NurseScheduleView";

export default function ReceptionSchedulePage() {
  return (
    <NurseScheduleView
      scheduleUrl="/api/reception/schedule"
      historyUrl="/api/reception/schedule"
    />
  );
}
