// This file is a thin re-export. The actual page implementation lives in
// frontend/components/pages/AppointmentsPage.tsx so it can be shared with
// the reception portal (/reception/appointments).
// The shared component is layout-agnostic; this route is wrapped in AdminLayout
// by _app.tsx. Role-based differences (e.g., revenue card hidden for receptionist)
// are handled inside the shared component using the currentUserRole state.
export { default } from "../components/pages/AppointmentsPage";
