// Reception wrapper for the patient profile page.
// Layout (ReceptionLayout) is applied globally by _app.tsx for /reception/* routes,
// so this page must NOT wrap itself in ReceptionLayout.
export { default } from "../../patients/[bookNumber]";
