import type { SelectHTMLAttributes } from "react";

interface Option {
    label: string;
    value: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: Option[];
    placeholder?: string;
}

export function Select({ label, id, options, placeholder, className = "", ...props }: Props) {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label htmlFor={id} className="text-xs text-mist-300">
                    {label}
                </label>
            )}
            <select
                id={id}
                className={`border border-mist-600 bg-gray-900 p-2 rounded-md outline-0 focus:border-mist-300 transition-colors ${className}`}
                {...props}
            >
                {placeholder && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
