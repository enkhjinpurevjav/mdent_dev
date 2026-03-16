import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { setBranchLock, clearBranchLock } from "./appointments/storage";
import { Drawer } from "./ui/Drawer";
import { logout } from "../utils/auth";

type Props = {
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href?: string;
  icon?: string;
  children?: NavItem[];
};

// Constants for special routes
const APPOINTMENTS_ALL_BRANCHES_ROUTE = "/appointments";

// Main navigation structure
const navItems: NavItem[] = [
  // 1. Хянах самбар (top-level link only)
  {
    label: "Хянах самбар",
    href: "/",
    icon: "🏠",
  },

   // 2. Цаг захиалах
    {
    label: "Цаг захиалах",
    icon: "📅",
    children: [
      {
        // only "Бүх салбар" is fixed; individual branches come from backend
        label: "Бүх салбар",
        href: APPOINTMENTS_ALL_BRANCHES_ROUTE,
        icon: "📅",
      },
    ],
  },

  // 3. Үзлэг
  {
    label: "Үзлэг",
    icon: "📋",
    children: [
      { label: "Цаг захиалсан", href: "/visits/booked", icon: "🕒" },
      { label: "Үзлэг хийж буй", href: "/visits/ongoing", icon: "⏱" },
      { label: "Дууссан", href: "/visits/completed", icon: "✅" },
    ],
  },

 // 4. Үйлчлүүлэгчид  ✅ make it a direct link, remove children
{
  label: "Үйлчлүүлэгч",
  href: "/patients",
  icon: "👥",
},

  // 5. Хүний нөөц
  {
    label: "Хүний нөөц",
    icon: "🧑‍💼",
    children: [
      { label: "Эмч", href: "/users/doctors", icon: "🩺" },
      { label: "Сувилагч", href: "/users/nurses", icon: "💉" },
      { label: "Ресепшн", href: "/users/reception", icon: "📞" },
      { label: "Ажилтан", href: "/users/staff", icon: "🏢" },
      {
        label: "Ажлын анкет мэдээллийн сан",
        href: "/hr/applicant-database",
        icon: "📁",
      },
      { label: "Материал", href: "/hr/materials", icon: "📦" },
      { label: "Тайлан харах", href: "/hr/reports", icon: "📊" },
      { label: "Ирцийн тайлан", href: "/admin/attendance", icon: "🕑" },
    ],
  },

  // Add this group somewhere appropriate in navItems, e.g. after "Үйлчилгээ"
{
  label: "Ариутгал",
  icon: "🧼",
  children: [
    { label: "Цикл үүсгэх", href: "/sterilization/cycles/new", icon: "🔄" },
    { label: "Өрмийн бүртгэл, хяналт", href: "/sterilization/bur-cycles", icon: "🦷" },
    { label: "Халдваргүйтгэл", href: "/sterilization/disinfection", icon: "🧴" },
    { label: "Циклийн жагсаалт", href: "/sterilization/cycles", icon: "📋" },
    { label: "Ариутгалын тайлан", href: "/sterilization/reports", icon: "📊" },
    { label: "Зөрүү", href: "/sterilization/mismatches", icon: "⚠️" },
    { label: "Багаж буцаалт", href: "/sterilization/returns", icon: "↩️" },
    { label: "Хаягдал (Устгал)", href: "/sterilization/disposals", icon: "🗑️" },
    { label: "Тохиргоо", href: "/sterilization/settings", icon: "⚙️" },
    { label: "Машинууд", href: "/sterilization/machines", icon: "🔧" },
  ],
},

  // 6. Санхүү
  {
    label: "Санхүү",
    icon: "💰",
    children: [
      { label: "Авлага", href: "/finance/debts", icon: "📄" },
      { label: "Илүү төлөлт", href: "/finance/overpayments", icon: "➕" },
      { label: "Бартер", href: "/finance/barter", icon: "🔄" },
      {
        label: "Ажилчдын ваучер",
        href: "/admin/finance/employee-vouchers",
        icon: "🎟️",
      },
       {
        // Only the General Income Page
        label: "Эмчийн орлогын тайлан",
        href: "/admin/doctor/income",
        icon: "📊",
      },
      
      {
        label: "Эмчийн хувийн тохиргоо",
        href: "/admin/staff-income-settings",
        icon: "⚙️",
      },

      {
        label: "Сувилагчийн орлогын тайлан",
        href: "/admin/nurse/income",
        icon: "📊",
      },
    
      {
        label: "Эмнэлгийн тайлан",
        href: "/finance/clinic-reports",
        icon: "🏥",
      },
    ],
  },

  // 7. Үйлчилгээ
  {
    label: "Үйлчилгээ",
    icon: "🧾",
    children: [
      { label: "Эмчилгээ үйлчилгээ", href: "/services", icon: "🦷" },
      { label: "Бараа материал", href: "/inventory", icon: "📦" },
      { label: "Жор", href: "/prescriptions", icon: "💊" },
      { label: "Онош", href: "/diagnoses", icon: "🩻" },
    ],
  },

  // 8. Төлбөрийн тохиргоо
  {
    label: "Төлбөрийн тохиргоо",
    icon: "💳",
    children: [
      {
        label: "Төлбөрийн тохиргоо",
        href: "/admin/payment-settings",
        icon: "⚙️",
      },
    ],
  },

  // 9. Салбарын тохиргоо
  {
    label: "Салбарын тохиргоо",
    icon: "🏥",
    children: [{ label: "Салбарууд", href: "/branches", icon: "🏥" }],
  },

  // 10. Үндсэн тайлан
  {
    label: "Үндсэн тайлан",
    icon: "📈",
    children: [{ label: "Үндсэн тайлан", href: "/reports", icon: "📊" }],
  },
];

export default function AdminLayout({ children }: Props) {
  const router = useRouter();
  const currentPath = router.pathname;

  // which main menu label is open (for dropdown)
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // mobile nav drawer
  const [navOpen, setNavOpen] = useState(false);

  // Branch list from backend (for Цаг захиалах dynamic items)
  const [branchItems, setBranchItems] = useState<{ id: string; name: string }[]>(
    []
  );

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  // Handler for branch selection in appointments submenu
  const handleBranchSelection = (branchId: string | null) => {
    if (branchId === null) {
      // "Бүх салбар" selected - clear lock
      clearBranchLock();
    } else {
      // Specific branch selected - set lock
      setBranchLock(branchId);
    }
  };

  // Auto-open the group that contains the current path
  useEffect(() => {
    const found = navItems.find((item) => {
      if (!item.children) return false;
      return item.children.some((child) => {
        if (!child.href) return false;
        if (child.href === "/") return currentPath === "/";
        return (
          currentPath === child.href ||
          currentPath.startsWith(child.href + "/")
        );
      });
    });
    if (found) {
      setOpenGroup(found.label);
    } else {
      setOpenGroup(null);
    }
  }, [currentPath]);

  // Load branches once for Цаг захиалах submenu (dynamic)
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((data) => {
        const mapped = (data || []).map((b: any) => ({
          id: String(b.id),
          name: b.name as string,
        }));
        setBranchItems(mapped);
      })
      .catch(() => setBranchItems([]));
  }, []);

  const activeBranchId =
    typeof router.query.branchId === "string" ? router.query.branchId : "";

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return currentPath === "/";
    return currentPath === href || currentPath.startsWith(href + "/");
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: "#f3f4f6",
      }}
    >
      {/* LEFT SIDEBAR */}
      <aside
        className="hidden lg:flex lg:flex-col"
        style={{
          width: 260,
          background: "#ffffff",
          borderRight: "1px solid #e5e7eb",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <img
            src="/clinic-logo.png"
            alt="Clinic logo"
            style={{
              width: 56,
              height: 56,
              objectFit: "contain",
              display: "block",
              borderRadius: 8,
            }}
          />

          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>MON FAMILY</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Dental Clinic
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: "12px 8px 16px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              color: "#9ca3af",
              padding: "4px 12px",
              marginBottom: 4,
            }}
          >
            Цэс
          </div>

          {navItems.map((item) => {
            // Top-level direct link (only Хянах самбар)
            if (!item.children && item.href) {
              const active = isActive(item.href);
              return (
                <div key={item.label} style={{ marginBottom: 4 }}>
                  <Link href={item.href} legacyBehavior>
                    <a
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        margin: "2px 4px",
                        borderRadius: 12,
                        textDecoration: "none",
                        fontSize: 14,
                        color: active ? "#0f172a" : "#1f2937",
                        background: active ? "#e5f0ff" : "transparent",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      <span style={{ width: 20, textAlign: "center" }}>
                        {item.icon ?? "•"}
                      </span>
                      <span>{item.label}</span>
                    </a>
                  </Link>
                </div>
              );
            }

            // Expandable group
            const isOpen = openGroup === item.label;
            const groupActive =
              isOpen ||
              (item.children ?? []).some((child) => isActive(child.href));

            return (
              <div key={item.label} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroup((prev) =>
                      prev === item.label ? null : item.label
                    )
                  }
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    margin: "2px 4px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontSize: 14,
                    color: groupActive ? "#0f172a" : "#1f2937",
                    fontWeight: groupActive ? 600 : 500,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ width: 20, textAlign: "center" }}>
                      {item.icon ?? "•"}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#4b5563" }}>
                    {isOpen ? "▾" : "▸"}
                  </span>
                </button>

                {isOpen && item.children && (
                  <div style={{ marginTop: 2, marginLeft: 28 }}>
                    {/* Special handling for Цаг захиалах to add fixed 4 branches + dynamic list */}
                    {item.label === "Цаг захиалах" ? (
                      <>
                        {item.children.map((child) => {
                          const active = isActive(child.href);
                          // For Bүх салбар, ignore branchId when checking
                          const isWhole =
                            child.href === "/appointments" &&
                            currentPath === "/appointments" &&
                            !activeBranchId;
                          const activeHere = active || isWhole;

                          return (
                            <Link
                              key={child.label}
                              href={child.href || "#"}
                              legacyBehavior
                            >
                              <a
                                onClick={() => {
                                  // Clear lock when "All Branches" route is selected (no specific branch)
                                  if (child.href === APPOINTMENTS_ALL_BRANCHES_ROUTE) {
                                    clearBranchLock();
                                  }
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "6px 10px",
                                  margin: "1px 0",
                                  borderRadius: 8,
                                  textDecoration: "none",
                                  fontSize: 13,
                                  color: activeHere ? "#1d4ed8" : "#4b5563",
                                  background: activeHere
                                    ? "#eff6ff"
                                    : "transparent",
                                  fontWeight: activeHere ? 600 : 400,
                                }}
                              >
                                <span
                                  style={{
                                    width: 16,
                                    textAlign: "center",
                                  }}
                                >
                                  {child.icon ?? "🏥"}
                                </span>
                                <span>{child.label}</span>
                              </a>
                            </Link>
                          );
                        })}

                        {/* Dynamic branches from backend */}
                        {branchItems.map((b) => {
                          const href = `/appointments?branchId=${encodeURIComponent(
                            b.id
                          )}`;
                          const isActiveBranch =
                            currentPath === "/appointments" &&
                            activeBranchId === b.id;
                          return (
                            <Link key={b.id} href={href} legacyBehavior>
                              <a
                                onClick={() => handleBranchSelection(b.id)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "6px 10px",
                                  margin: "1px 0",
                                  borderRadius: 8,
                                  textDecoration: "none",
                                  fontSize: 13,
                                  color: isActiveBranch
                                    ? "#1d4ed8"
                                    : "#4b5563",
                                  background: isActiveBranch
                                    ? "#eff6ff"
                                    : "transparent",
                                  fontWeight: isActiveBranch ? 600 : 400,
                                }}
                              >
                                <span
                                  style={{
                                    width: 16,
                                    textAlign: "center",
                                  }}
                                >
                                  🏥
                                </span>
                                <span>{b.name}</span>
                              </a>
                            </Link>
                          );
                        })}
                      </>
                    ) : (
                      // Normal groups
                      item.children.map((child) => {
                        const active = isActive(child.href);
                        return (
                          <Link
                            key={child.label}
                            href={child.href || "#"}
                            legacyBehavior
                          >
                            <a
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 10px",
                                margin: "1px 0",
                                borderRadius: 8,
                                textDecoration: "none",
                                fontSize: 13,
                                color: active ? "#1d4ed8" : "#4b5563",
                                background: active ? "#eff6ff" : "transparent",
                                fontWeight: active ? 600 : 400,
                              }}
                            >
                              {child.icon && (
                                <span
                                  style={{
                                    width: 16,
                                    textAlign: "center",
                                  }}
                                >
                                  {child.icon}
                                </span>
                              )}
                              <span>{child.label}</span>
                            </a>
                          </Link>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom-pinned attendance link */}
        <div style={{ padding: "8px 8px 0" }}>
          <Link href="/attendance" legacyBehavior>
            <a
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                margin: "2px 4px",
                borderRadius: 12,
                textDecoration: "none",
                fontSize: 14,
                color: isActive("/attendance") ? "#0f172a" : "#1f2937",
                background: isActive("/attendance") ? "#e5f0ff" : "transparent",
                fontWeight: isActive("/attendance") ? 600 : 500,
              }}
            >
              <span style={{ width: 20, textAlign: "center" }}>🕘</span>
              <span>Ирц бүртгэл</span>
            </a>
          </Link>
        </div>

        {/* Sidebar footer */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid #e5e7eb",
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          <div>Copyright © 2025 - M Peak LLC</div>
        </div>
      </aside>

      {/* RIGHT SIDE: TOP BAR + PAGE CONTENT (unchanged) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <header
          style={{
            height: 64,
            background: "#061325",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {/* Hamburger button - mobile only */}
            <button
              type="button"
              className="lg:hidden"
              onClick={() => setNavOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: 24,
                cursor: "pointer",
                padding: "4px 8px",
                lineHeight: 1,
              }}
              aria-label="Цэс нээх"
            >
              ☰
            </button>
       
<img
  src="/mdent.svg"
  alt="M Dent Software logo"
  style={{ height: 34, width: "auto", display: "block" }}
/>

            <span
              style={{
                fontWeight: 600,
                fontSize: 22,
              }}
            >
              <span style={{ color: "#f97316" }}>M</span> Dent Software
              Solution
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              style={{
                position: "relative",
                width: 32,
                height: 32,
                borderRadius: "999px",
                border: "none",
                background: "rgba(15,23,42,0.4)",
                color: "white",
                cursor: "pointer",
              }}
            >
              🔔
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 10,
                  height: 10,
                  borderRadius: "999px",
                  background: "#ef4444",
                  border: "1px solid white",
                }}
              />
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1d4ed8",
                  fontWeight: 700,
                }}
              >
                E
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>Enkhjin</div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>Админ</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Гарах"
              style={{
                background: "rgba(15,23,42,0.4)",
                border: "none",
                color: "white",
                cursor: "pointer",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 13,
              }}
            >
              🚪 Гарах
            </button>
          </div>
        </header>

        {/* Mobile navigation drawer */}
        <Drawer side="left" open={navOpen} onClose={() => setNavOpen(false)}>
          {/* Sidebar logo/header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <img
              src="/clinic-logo.png"
              alt="Clinic logo"
              style={{
                width: 56,
                height: 56,
                objectFit: "contain",
                display: "block",
                borderRadius: 8,
              }}
            />
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>MON FAMILY</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Dental Clinic</div>
            </div>
          </div>

          {/* Navigation items */}
          <nav style={{ padding: "12px 8px 16px" }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                color: "#9ca3af",
                padding: "4px 12px",
                marginBottom: 4,
              }}
            >
              Цэс
            </div>

            {navItems.map((item) => {
              if (!item.children && item.href) {
                const active = isActive(item.href);
                return (
                  <div key={item.label} style={{ marginBottom: 4 }}>
                    <Link href={item.href} legacyBehavior>
                      <a
                        onClick={() => setNavOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 12px",
                          margin: "2px 4px",
                          borderRadius: 12,
                          textDecoration: "none",
                          fontSize: 14,
                          color: active ? "#0f172a" : "#1f2937",
                          background: active ? "#e5f0ff" : "transparent",
                          fontWeight: active ? 600 : 500,
                        }}
                      >
                        <span style={{ width: 20, textAlign: "center" }}>{item.icon ?? "•"}</span>
                        <span>{item.label}</span>
                      </a>
                    </Link>
                  </div>
                );
              }

              const isOpen = openGroup === item.label;
              const groupActive =
                isOpen || (item.children ?? []).some((child) => isActive(child.href));

              return (
                <div key={item.label} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroup((prev) => (prev === item.label ? null : item.label))
                    }
                    style={{
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      margin: "2px 4px",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontSize: 14,
                      color: groupActive ? "#0f172a" : "#1f2937",
                      fontWeight: groupActive ? 600 : 500,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 20, textAlign: "center" }}>{item.icon ?? "•"}</span>
                      <span>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "#4b5563" }}>{isOpen ? "▾" : "▸"}</span>
                  </button>

                  {isOpen && item.children && (
                    <div style={{ marginTop: 2, marginLeft: 28 }}>
                      {item.label === "Цаг захиалах" ? (
                        <>
                          {item.children.map((child) => {
                            const active = isActive(child.href);
                            const isWhole =
                              child.href === "/appointments" &&
                              currentPath === "/appointments" &&
                              !activeBranchId;
                            const activeHere = active || isWhole;
                            return (
                              <Link key={child.label} href={child.href || "#"} legacyBehavior>
                                <a
                                  onClick={() => {
                                    if (child.href === APPOINTMENTS_ALL_BRANCHES_ROUTE) {
                                      clearBranchLock();
                                    }
                                    setNavOpen(false);
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 10px",
                                    margin: "1px 0",
                                    borderRadius: 8,
                                    textDecoration: "none",
                                    fontSize: 13,
                                    color: activeHere ? "#1d4ed8" : "#4b5563",
                                    background: activeHere ? "#eff6ff" : "transparent",
                                    fontWeight: activeHere ? 600 : 400,
                                  }}
                                >
                                  <span style={{ width: 16, textAlign: "center" }}>
                                    {child.icon ?? "🏥"}
                                  </span>
                                  <span>{child.label}</span>
                                </a>
                              </Link>
                            );
                          })}
                          {branchItems.map((b) => {
                            const href = `/appointments?branchId=${encodeURIComponent(b.id)}`;
                            const isActiveBranch =
                              currentPath === "/appointments" && activeBranchId === b.id;
                            return (
                              <Link key={b.id} href={href} legacyBehavior>
                                <a
                                  onClick={() => {
                                    handleBranchSelection(b.id);
                                    setNavOpen(false);
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 10px",
                                    margin: "1px 0",
                                    borderRadius: 8,
                                    textDecoration: "none",
                                    fontSize: 13,
                                    color: isActiveBranch ? "#1d4ed8" : "#4b5563",
                                    background: isActiveBranch ? "#eff6ff" : "transparent",
                                    fontWeight: isActiveBranch ? 600 : 400,
                                  }}
                                >
                                  <span style={{ width: 16, textAlign: "center" }}>🏥</span>
                                  <span>{b.name}</span>
                                </a>
                              </Link>
                            );
                          })}
                        </>
                      ) : (
                        item.children.map((child) => {
                          const active = isActive(child.href);
                          return (
                            <Link key={child.label} href={child.href || "#"} legacyBehavior>
                              <a
                                onClick={() => setNavOpen(false)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "6px 10px",
                                  margin: "1px 0",
                                  borderRadius: 8,
                                  textDecoration: "none",
                                  fontSize: 13,
                                  color: active ? "#1d4ed8" : "#4b5563",
                                  background: active ? "#eff6ff" : "transparent",
                                  fontWeight: active ? 600 : 400,
                                }}
                              >
                                {child.icon && (
                                  <span style={{ width: 16, textAlign: "center" }}>
                                    {child.icon}
                                  </span>
                                )}
                                <span>{child.label}</span>
                              </a>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Bottom-pinned attendance link */}
          <div style={{ padding: "8px 8px 0" }}>
            <Link href="/attendance" legacyBehavior>
              <a
                onClick={() => setNavOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  margin: "2px 4px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontSize: 14,
                  color: isActive("/attendance") ? "#0f172a" : "#1f2937",
                  background: isActive("/attendance") ? "#e5f0ff" : "transparent",
                  fontWeight: isActive("/attendance") ? 600 : 500,
                }}
              >
                <span style={{ width: 20, textAlign: "center" }}>🕘</span>
                <span>Ирц бүртгэл</span>
              </a>
            </Link>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #e5e7eb",
              fontSize: 12,
              color: "#6b7280",
              marginTop: "auto",
            }}
          >
            <div>Copyright © 2025 - M Peak LLC</div>
          </div>
        </Drawer>

        <main
          style={{
            flex: 1,
            padding: 20,
            overflow: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
