import React, { useState } from "react";

type StaffAvatarProps = {
  name?: string | null;
  ovog?: string | null;
  email?: string | null;
  idPhotoPath?: string | null;
  variant?: "sidebar" | "compact";
  sizeClassName?: string;
  className?: string;
};

function getInitials(
  name?: string | null,
  ovog?: string | null,
  email?: string | null
): string {
  const n = (name || "").trim();
  const o = (ovog || "").trim();

  if (o && n) {
    return `${o.charAt(0).toUpperCase()}.${n.charAt(0).toUpperCase()}`;
  }
  if (o) return o.charAt(0).toUpperCase();
  if (n) return n.charAt(0).toUpperCase();
  const e = (email || "").trim();
  if (e) return e.charAt(0).toUpperCase();
  return "?";
}

export default function StaffAvatar({
  name,
  ovog,
  email,
  idPhotoPath,
  variant = "compact",
  sizeClassName,
  className = "",
}: StaffAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const showPhoto = !!idPhotoPath && !imgError;
  const initials = getInitials(name, ovog, email);

  const defaultSize =
    variant === "sidebar" ? "w-full h-[190px]" : "w-16 h-16";
  const sizeClass = sizeClassName ?? defaultSize;

  if (showPhoto) {
    return (
      <div
        className={`${sizeClass} rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 ${className}`}
      >
        <img
          src={idPhotoPath!}
          alt="Зураг"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-600 font-bold select-none ${className}`}
    >
      <span className={variant === "sidebar" ? "text-4xl" : "text-lg"}>
        {initials}
      </span>
    </div>
  );
}
