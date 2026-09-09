import type { ButtonHTMLAttributes } from "react";

export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            className={`cursor-pointer p-1 rounded-full transition-colors ${className || "hover:bg-gray-700"}`}
            {...props}
        />
    );
}
