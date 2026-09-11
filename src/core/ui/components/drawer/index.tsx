import { XMarkIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";
import type { ReactNode } from "react";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
}

export function Drawer({ isOpen, onClose, title, children }: Props) {
    return (
        <div className={`fixed inset-0 z-40 ${isOpen ? "" : "pointer-events-none"}`}>
            <div
                className={`absolute inset-0 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0"}`}
                onClick={onClose}
            />
            <div
                className={`absolute top-0 right-0 h-full w-full max-w-xl bg-gray-900 border-l border-gray-700 shadow-2xl transition-transform overflow-y-auto ${
                    isOpen ? "translate-x-0" : "translate-x-full"
                }`}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-900">
                    <h2 className="text-base font-semibold">{title}</h2>
                    <IconButton onClick={onClose} aria-label="Fechar">
                        <XMarkIcon className="size-5" />
                    </IconButton>
                </div>
                <div className="p-4 flex flex-col gap-4">{children}</div>
            </div>
        </div>
    );
}
