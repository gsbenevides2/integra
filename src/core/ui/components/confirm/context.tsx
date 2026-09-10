import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
}

interface ConfirmState extends Required<ConfirmOptions> {
    isOpen: boolean;
}

interface ConfirmContextValue {
    state: ConfirmState;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    resolve: (value: boolean) => void;
}

const DEFAULT_STATE: ConfirmState = {
    isOpen: false,
    title: "Confirmar ação",
    message: "",
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ConfirmState>(DEFAULT_STATE);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolvePromise) => {
            resolveRef.current = resolvePromise;
            setState({
                isOpen: true,
                title: options.title ?? DEFAULT_STATE.title,
                message: options.message,
                confirmLabel: options.confirmLabel ?? DEFAULT_STATE.confirmLabel,
                cancelLabel: options.cancelLabel ?? DEFAULT_STATE.cancelLabel,
            });
        });
    }, []);

    const resolve = useCallback((value: boolean) => {
        setState((current) => ({ ...current, isOpen: false }));
        resolveRef.current?.(value);
        resolveRef.current = null;
    }, []);

    return (
        <ConfirmContext.Provider value={{ state, confirm, resolve }}>
            {children}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) throw new Error("useConfirm must be used within a ConfirmProvider");
    return context.confirm;
}

export function useConfirmState() {
    const context = useContext(ConfirmContext);
    if (!context) throw new Error("useConfirmState must be used within a ConfirmProvider");
    return context;
}
