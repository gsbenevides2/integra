import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastType = "success" | "error";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    toasts: Toast[];
    showToast: (message: string, type: ToastType) => void;
    dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismissToast = useCallback((id: string) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback(
        (message: string, type: ToastType) => {
            const id = crypto.randomUUID();
            setToasts((current) => [...current, { id, message, type }]);
            setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
        },
        [dismissToast],
    );

    return (
        <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within a ToastProvider");
    return context;
}
