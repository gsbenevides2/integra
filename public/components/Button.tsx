import React, { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-mist-900 hover:bg-mist-600",
  secondary: "hover:bg-gray-700",
};

export function Button({
  variant = "primary",
  isLoading = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      className={`
        flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-sm
        transition-colors
        disabled:cursor-not-allowed disabled:opacity-60
        ${variantClasses[variant]}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="
          size-3.5 animate-spin rounded-full border-2 border-current
          border-t-transparent
        " />
      )}
      {children}
    </button>
  );
}
