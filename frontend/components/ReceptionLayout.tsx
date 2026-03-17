import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { logout } from "../utils/auth";
import { useAuth } from "../contexts/AuthContext";
import { Bell, CalendarDays, CalendarRange, Clock, ClipboardList, LogOut, User } from "lucide-react";

type Props = {
  children: React.ReactNode;
  wide?: boolean;
};

const NAVY = "#131a29";

const BOTTOM_NAV = [
  {
    label: "Цаг захиалга",
    shortLabel: "Цаг",
    href: "/reception/appointments",
    icon: "calendarDays" as const,
  },
  {
    label: "Захиалга",
    shortLabel: "Захиалга",
    href: "/reception/bookings",
    icon: "calendarRange" as const,
  },
  {
    label: "Үйлчлүүлэгч",
    shortLabel: "Үйлч",
    href: "/reception/patients",
    icon: "user" as const,
  },
];

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function BottomIcon({
  kind,
  active,
}: {
  kind: (typeof BOTTOM_NAV)[number]["icon"];
  active: boolean;
}) {
  const cls = classNames(
    "h-[22px] w-[22px]",
    active ? "text-[#131a29]" : "text-gray-400"
  );

  switch (kind) {
    case "calendarDays":
      return <CalendarDays className={cls} />;
    case "calendarRange":
      return <CalendarRange className={cls} />;
    case "user":
      return <User className={cls} />;
  }
}

export default function ReceptionLayout({ children, wide }: Props) {
  const router = useRouter();
  const { me } = useAuth();
  const isActive = (href: string) => router.pathname.startsWith(href);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  /** Format: Овгийн эхний үсэг.Нэр (e.g. П.Энхжин). Falls back to name or "Рецепшн". */
  const displayName = (() => {
    if (!me) return "Рецепшн";
    const ovog = me.ovog?.trim();
    if (ovog) return `${ovog.charAt(0).toUpperCase()}.${me.name}`;
    return me.name || "Рецепшн";
  })();

  return (
    <div className={`min-h-[100dvh] bg-gray-100${wide ? "" : " overflow-x-hidden"}`}>
      {/* Top Bar */}
      <header
        className="fixed top-0 left-0 right-0 h-11 text-white z-[100] overflow-x-hidden"
        style={{ background: NAVY }}
      >
        <div className="h-full w-full px-3 flex items-center justify-between min-w-0 md:max-w-[1024px] md:mx-auto">
          {/* Brand */}
          <Link
            href="/reception/appointments"
            className="min-w-0 flex items-center gap-2 no-underline text-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://mdent.cloud/mdent.svg"
              alt="mDent"
              className="h-7 w-7 shrink-0"
            />
            <span className="min-w-0 truncate font-extrabold tracking-wide text-[13px] sm:text-sm">
              <span className="sm:hidden">
                <span className="text-orange-400">M</span> Dent
              </span>
              <span className="hidden sm:inline">
                <span className="text-orange-400">M</span> Dent • {displayName}
              </span>
            </span>
          </Link>

          {/* Right actions */}
          <div className="flex items-center gap-0 min-w-0">
            <button
              title="Мэдэгдэл"
              disabled
              className="p-1.5 sm:p-2 rounded-lg text-white/60 cursor-default"
            >
              <Bell className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </button>

            <Link
              href="/reception/attendance"
              title="Ирц бүртгэл"
              aria-label="Ирц бүртгэл"
              className={classNames(
                "p-1.5 sm:p-2 rounded-lg inline-flex items-center no-underline",
                isActive("/reception/attendance")
                  ? "text-white"
                  : "text-white/75 hover:text-white"
              )}
            >
              <Clock className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </Link>

            <Link
              href="/reception/schedule"
              title="Ажлын хуваарь"
              aria-label="Ажлын хуваарь"
              className={classNames(
                "p-1.5 sm:p-2 rounded-lg inline-flex items-center no-underline",
                isActive("/reception/schedule")
                  ? "text-white"
                  : "text-white/75 hover:text-white"
              )}
            >
              <ClipboardList className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </Link>

            <Link
              href="/reception/profile"
              title="Профайл"
              aria-label="Профайл"
              className={classNames(
                "p-1.5 sm:p-2 rounded-lg inline-flex items-center no-underline",
                isActive("/reception/profile")
                  ? "text-white"
                  : "text-white/75 hover:text-white"
              )}
            >
              <User className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </Link>

            <button
              onClick={handleLogout}
              title="Гарах"
              className="p-1.5 sm:p-2 rounded-lg text-white/75 hover:text-white"
            >
              <LogOut className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={`pt-11 pb-[60px] w-full${wide ? " px-2 sm:px-4" : " px-3 sm:px-4 md:max-w-[1024px] md:mx-auto overflow-x-hidden"}`}>
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-white border-t border-gray-200 z-[100] overflow-x-hidden">
        <div className="h-full w-full flex min-w-0 md:max-w-[1024px] md:mx-auto">
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
                <BottomIcon kind={item.icon} active={active} />

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
