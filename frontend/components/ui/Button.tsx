import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white border-transparent hover:bg-blue-700",
  secondary: "bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200",
  danger: "bg-red-50 text-red-600 border-red-300 hover:bg-red-100",
  ghost: "bg-transparent text-gray-700 border-gray-200 hover:bg-gray-100",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded-md border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
