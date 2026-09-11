import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: Props) {
    return createPortal(
        <div
            className={`fixed inset-0 z-50 bg-mist-950/90 backdrop-blur-sm flex justify-center items-center p-4 transition-opacity duration-200 ${
                isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={`bg-gray-800 w-full max-w-md rounded-lg shadow-xl flex flex-col gap-4 p-4 transition-all duration-200 ${
                    isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
            >
                <h3 className="text-base font-semibold">{title}</h3>
                {children}
            </div>
        </div>,
        document.body,
    );
}
