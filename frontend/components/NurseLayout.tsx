import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { Bell, Clock, LogOut, CalendarRange, User } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

const NAVY = "#131a29";

const BOTTOM_NAV = [
  {
    label: "Хуваарь",
    shortLabel: "Хув",
    href: "/nurse/schedule",
    icon: "calendarRange" as const,
  },
  {
    label: "Орлого",
    shortLabel: "₮",
    href: "/nurse/income",
    icon: "tugrik" as const,
  },
  {
    label: "Профайл",
    shortLabel: "Проф",
    href: "/nurse/profile",
    icon: "user" as const,
  },
];

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function TugrikIcon({ active }: { active: boolean }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center justify-center rounded-full border",
        active
          ? "border-[#131a29] text-[#131a29]"
          : "border-gray-400 text-gray-400"
      )}
      style={{ width: 22, height: 22, fontSize: 14, lineHeight: 1 }}
      aria-hidden="true"
    >
      ₮
    </span>
  );
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
    case "calendarRange":
      return <CalendarRange className={cls} />;
    case "user":
      return <User className={cls} />;
    case "tugrik":
      return <TugrikIcon active={active} />;
  }
}

export default function NurseLayout({ children }: Props) {
  const router = useRouter();
  const isActive = (href: string) => router.pathname.startsWith(href);

 const { logoutAndRedirect } = useAuth();

  const handleLogout = async () => {
    await logoutAndRedirect();
  };

  return (
    <div className="min-h-[100dvh] bg-gray-100 overflow-x-hidden">
      {/* Top Bar */}
      <header
        className="fixed top-0 left-0 right-0 h-11 text-white z-[100] overflow-x-hidden"
        style={{ background: NAVY }}
      >
        <div className="h-full w-full px-3 flex items-center justify-between min-w-0 sm:max-w-[720px] sm:mx-auto">
          {/* Brand */}
          <Link
            href="/nurse/schedule"
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
                <span className="text-orange-400">M</span> Dent Software Solution
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
              href="/nurse/attendance"
              title="Ирц"
              aria-label="Ирц"
              className={classNames(
                "p-1.5 sm:p-2 rounded-lg inline-flex items-center no-underline",
                isActive("/nurse/attendance")
                  ? "text-white"
                  : "text-white/75 hover:text-white"
              )}
            >
              <Clock className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
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
      <main className="pt-11 pb-[60px] w-full px-3 sm:px-4 sm:max-w-[720px] sm:mx-auto overflow-x-hidden">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-[60px] bg-white border-t border-gray-200 z-[100] overflow-x-hidden">
        <div className="h-full w-full flex min-w-0 sm:max-w-[720px] sm:mx-auto">
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
