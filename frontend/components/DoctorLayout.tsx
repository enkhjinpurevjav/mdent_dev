import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { logout } from "../utils/auth";
import {
  Bell,
  BarChart3,
  ClipboardList,
  LogOut,
  CalendarDays,
  CalendarRange,
  User,
} from "lucide-react";

type Props = {
  children: React.ReactNode;
};

const NAVY = "#131a29";
const TOP_H = 56;
const BOTTOM_H = 60;

const BOTTOM_NAV = [
  {
    label: "Цагууд",
    shortLabel: "Цаг",
    href: "/doctor/appointments",
    Icon: CalendarDays,
  },
  {
    label: "Хуваарь",
    shortLabel: "Хув",
    href: "/doctor/schedule",
    Icon: CalendarRange,
  },
  {
    label: "Борлуулалт",
    shortLabel: "₮",
    href: "/doctor/sales",
    Icon: null as any, // handled separately
  },
  {
    label: "Профайл",
    shortLabel: "Проф",
    href: "/doctor/profile",
    Icon: User,
  },
];

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function TugrikIcon({
  active,
  size = 22,
}: {
  active: boolean;
  size?: number;
}) {
  // Outline-style "icon": circle border + ₮ glyph
  return (
    <span
      className={classNames(
        "inline-flex items-center justify-center rounded-full border",
        active ? "border-[#131a29] text-[#131a29]" : "border-gray-400 text-gray-400"
      )}
      style={{ width: size, height: size, fontSize: 14, lineHeight: 1 }}
      aria-hidden="true"
    >
      ₮
    </span>
  );
}

export default function DoctorLayout({ children }: Props) {
  const router = useRouter();
  const isActive = (href: string) => router.pathname.startsWith(href);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-[100dvh] bg-gray-100 overflow-x-hidden">
      {/* Top Bar */}
      <header
        className="fixed top-0 left-0 right-0 h-14 text-white z-[100]"
        style={{ background: NAVY }}
      >
        <div className="h-full w-full px-3 flex items-center justify-between sm:max-w-[720px] sm:mx-auto">
          {/* Brand */}
          <Link
            href="/doctor/appointments"
            className="min-w-0 flex items-center gap-2 no-underline text-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://mdent.cloud/mdent.svg"
              alt="mDent"
              className="h-7 w-7 shrink-0"
            />
            <span className="min-w-0 truncate font-extrabold tracking-wide text-[13px] sm:text-sm">
              <span className="text-orange-400">M</span> Dent Software Solution
            </span>
          </Link>

          {/* Right actions */}
          <div className="flex items-center gap-0.5">
            <button
              title="Мэдэгдэл"
              disabled
              className="p-2 rounded-lg text-white/60 cursor-default"
            >
              <Bell className="h-5 w-5" />
            </button>

            <Link
              href="/doctor/performance"
              title="Гүйцэтгэл"
              className={classNames(
                "p-2 rounded-lg inline-flex items-center no-underline",
                isActive("/doctor/performance")
                  ? "text-white"
                  : "text-white/75 hover:text-white"
              )}
            >
              <BarChart3 className="h-5 w-5" />
            </Link>

            <Link
              href="/doctor/history"
              title="Үзлэгийн түүх"
              className={classNames(
                "p-2 rounded-lg inline-flex items-center no-underline",
                isActive("/doctor/history")
                  ? "text-white"
                  : "text-white/75 hover:text-white"
              )}
            >
              <ClipboardList className="h-5 w-5" />
            </Link>

            <button
              onClick={handleLogout}
              title="Гарах"
              className="p-2 rounded-lg text-white/75 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content (padded for fixed bars) */}
      <main className="pt-14 pb-[60px] w-full px-3 sm:px-4 sm:max-w-[720px] sm:mx-auto overflow-x-hidden">
        {/* keep exact heights aligned */}
        <div style={{ paddingTop: TOP_H - 56, paddingBottom: BOTTOM_H - 60 }}>
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-white border-t border-gray-200 z-[100]">
        <div className="h-full w-full flex sm:max-w-[720px] sm:mx-auto">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={classNames(
                  "flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 no-underline",
                  active
                    ? "text-[#131a29] font-bold border-t-2 border-[#131a29]"
                    : "text-gray-400 font-normal border-t-2 border-transparent"
                )}
              >
                {item.label === "Борлуулалт" ? (
                  <TugrikIcon active={active} size={22} />
                ) : (
                  <item.Icon className="h-[22px] w-[22px]" />
                )}

                {/* short labels on xs, full on sm+ */}
                <span className="text-[10px] leading-none truncate sm:hidden">
                  {item.shortLabel}
                </span>
                <span className="hidden sm:block text-[10px] leading-none truncate px-1">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
