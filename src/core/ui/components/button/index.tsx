import type { ButtonHTMLAttributes } from "react";

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
            className={`text-sm flex items-center gap-1 px-3 py-1.5 rounded-md cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && (
                <span className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            {children}
        </button>
    );
}
