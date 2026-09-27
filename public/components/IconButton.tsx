import React, { ButtonHTMLAttributes } from "react";

export function IconButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`
        cursor-pointer rounded-full p-1 transition-colors
        ${className || `hover:bg-gray-700`}
      `}
      {...props}
    />
  );
}
