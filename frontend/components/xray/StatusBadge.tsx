import React from "react";

type Props = {
  status: string;
};

export function StatusBadge({ status }: Props) {
  if (status === "ongoing") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
        Явагдаж байна
      </span>
    );
  }
  if (status === "imaging") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
        Зураг
      </span>
    );
  }
  return null;
}
