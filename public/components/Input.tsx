import React, { type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className = "", ...props }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs text-mist-300">
          {label}
        </label>
      )}
      <input
        id={id}
        name={id}
        className={`
          rounded-md border border-mist-600 bg-gray-900 p-2 outline-0
          transition-colors
          focus:border-mist-300
          ${className}
        `}
        {...props}
      />
    </div>
  );
}
