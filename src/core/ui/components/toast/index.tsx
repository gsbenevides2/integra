import { CheckCircleIcon, XCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";
import { useToast, type ToastType } from "./context";

const typeClasses: Record<ToastType, string> = {
    success: "border-green-700",
    error: "border-red-700",
};

const typeIcons: Record<ToastType, typeof CheckCircleIcon> = {
    success: CheckCircleIcon,
    error: XCircleIcon,
};

export { ToastProvider, useToast } from "./context";

export function ToastContainer() {
    const { toasts, dismissToast } = useToast();

    return (
        <div className="fixed bottom-4 right-4 z-100 flex flex-col gap-2 w-full max-w-xs">
            {toasts.map((toast) => {
                const Icon = typeIcons[toast.type];
                return (
                    <div
                        key={toast.id}
                        className={`bg-gray-800 border-l-4 ${typeClasses[toast.type]} rounded-md shadow-xl p-3 text-sm flex items-center gap-2`}
                    >
                        <Icon className="size-5 shrink-0" />
                        <p className="grow">{toast.message}</p>
                        <IconButton
                            type="button"
                            onClick={() => dismissToast(toast.id)}
                            className="hover:bg-gray-700 shrink-0"
                        >
                            <XMarkIcon className="size-4" />
                        </IconButton>
                    </div>
                );
            })}
        </div>
    );
}
