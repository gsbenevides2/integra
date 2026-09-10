import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import { useConfirmState } from "./context";

export { ConfirmProvider, useConfirm } from "./context";

export function ConfirmDialog() {
    const { state, resolve } = useConfirmState();

    return (
        <div
            className={`fixed inset-0 z-50 bg-mist-950/90 backdrop-blur-sm flex justify-center items-center p-4 transition-opacity duration-200 ${
                state.isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={(e) => {
                if (e.target === e.currentTarget) resolve(false);
            }}
        >
            <div
                className={`bg-gray-800 w-full max-w-sm rounded-lg shadow-xl flex flex-col gap-4 p-4 transition-all duration-200 ${
                    state.isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
            >
                <div className="flex items-start gap-3">
                    <div className="bg-red-950 text-red-500 rounded-full p-2 shrink-0">
                        <ExclamationTriangleIcon className="size-5" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h3 className="text-lg font-semibold">{state.title}</h3>
                        <p className="text-sm text-mist-300">{state.message}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => resolve(false)}>
                        {state.cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        className="bg-red-800 hover:bg-red-700"
                        onClick={() => resolve(true)}
                    >
                        {state.confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
