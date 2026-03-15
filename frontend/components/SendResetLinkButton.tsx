import React, { useState } from "react";

interface Props {
  userId: number;
  className?: string;
}

export default function SendResetLinkButton({ userId, className }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const btnCls = [
    "inline-flex items-center justify-center w-7 h-7 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const tooltipCls =
    "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100";

  async function handleClick() {
    if (!window.confirm("Нууц үг сэргээх холбоос илгээх үү?")) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/admin/users/${userId}/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("request failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <span className="text-xs text-green-600 whitespace-nowrap">
        Илгээх хүсэлт амжилттай.
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="text-xs text-red-500 whitespace-nowrap">
        Сүлжээгээ шалгана уу
      </span>
    );
  }

  return (
    <div className="group relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        aria-label="Нууц үг сэргээх"
        className={btnCls}
      >
        {status === "loading" ? (
          <svg
            className="w-4 h-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M15.75 1.5a6.75 6.75 0 00-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a.75.75 0 00-.22.53v2.25c0 .414.336.75.75.75H6a.75.75 0 00.75-.75V18h1.5a.75.75 0 00.75-.75V15h1.5a.75.75 0 00.53-.22l.5-.5a.75.75 0 00.154-.838A6.75 6.75 0 0115.75 1.5zm0 3a.75.75 0 000 1.5A2.25 2.25 0 0118 8.25a.75.75 0 001.5 0 3.75 3.75 0 00-3.75-3.75z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      <span className={tooltipCls}>Нууц үг сэргээх</span>
    </div>
  );
}
