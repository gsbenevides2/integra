import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
    primary: "bg-mist-900 hover:bg-mist-600",
    secondary: "hover:bg-gray-700",
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
    return (
        <button
            className={`text-sm flex items-center gap-1 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${variantClasses[variant]} ${className}`}
            {...props}
        />
    );
}
