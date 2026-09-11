interface Props {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
}

export function Switch({ checked, onChange, disabled, label }: Props) {
    return (
        <label
            className={`inline-flex items-center gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}
        >
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-0 ${
                    checked ? "bg-mist-500" : "bg-gray-600"
                } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
                <span
                    className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${
                        checked ? "translate-x-4.5" : "translate-x-1"
                    }`}
                />
            </button>
            {label && <span className="text-xs text-mist-300">{label}</span>}
        </label>
    );
}
