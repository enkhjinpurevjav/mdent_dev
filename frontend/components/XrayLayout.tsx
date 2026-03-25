import React from "react";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { LogOut } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

const NAVY = "#131a29";

export default function XrayLayout({ children }: Props) {
  const { me, logoutAndRedirect } = useAuth();

  const handleLogout = async () => {
    await logoutAndRedirect();
  };

  /** Format: Овгийн эхний үсэг.Нэр (e.g. О.Нэр). Falls back to name or "Рентген". */
  const displayName = (() => {
    if (!me) return "Рентген";
    const ovog = me.ovog?.trim();
    if (ovog) return `${ovog.charAt(0).toUpperCase()}.${me.name}`;
    return me.name || "Рентген";
  })();

  return (
    <div className="min-h-[100dvh] bg-gray-100">
      {/* Top Bar */}
      <header
        className="fixed top-0 left-0 right-0 h-11 text-white z-[100] overflow-x-hidden"
        style={{ background: NAVY }}
      >
        <div className="h-full w-full px-3 flex items-center justify-between min-w-0">
          {/* Brand */}
          <Link
            href="/xray"
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
            {/* Display name on small screens */}
            <span className="sm:hidden text-xs text-white/80 mr-2 truncate max-w-[120px]">
              {displayName}
            </span>

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
      <main className="pt-11 w-full">
        {children}
      </main>
    </div>
  );
}
