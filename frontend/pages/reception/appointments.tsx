// Reception portal appointments page.
// Renders the shared AppointmentsPage component (layout-agnostic — no layout wrapper inside).
// Layout (ReceptionLayout) is applied globally by _app.tsx for /reception/* routes,
// so this page must NOT wrap itself in ReceptionLayout.
// Role-based differences (e.g., "Борлуулалтын орлого" card hidden for receptionist)
// are handled inside the shared component using the currentUserRole state.
export { default } from "../../components/pages/AppointmentsPage";
