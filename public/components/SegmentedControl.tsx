import React from "react";

interface Props<T extends string> {
  options: readonly (readonly [id: T, label: string])[];
  value: T;
  onChange: (id: T) => void;
  /** Container shape/colours. */
  className?: string;
  /** The sliding highlight: shape and colour. */
  pillClassName?: string;
  /** Per-segment padding and text size. */
  buttonClassName?: string;
}

/** Equal-width segments, so the highlight slides by whole multiples of its own width. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "rounded-full bg-gray-800 text-xs",
  pillClassName = "rounded-full bg-gray-700",
  buttonClassName = "px-4 py-1",
}: Props<T>) {
  const index = Math.max(
    0,
    options.findIndex(([id]) => id === value),
  );

  return (
    <div
      role="tablist"
      className={`
        relative grid auto-cols-fr grid-flow-col p-1
        ${className}
      `}
    >
      <span
        aria-hidden
        className={`
          absolute inset-y-1 left-1 transition-transform duration-200 ease-out
          ${pillClassName}
        `}
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === value}
          onClick={() => onChange(id)}
          className={`
            relative cursor-pointer text-center transition-colors
            ${buttonClassName}
            ${
              id === value
                ? "text-mist-200"
                : `
                  text-mist-400
                  hover:text-mist-300
                `
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
