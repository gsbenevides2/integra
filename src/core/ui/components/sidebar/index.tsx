import { XMarkIcon } from "@heroicons/react/24/outline";
import { dashboards } from "extensions/dashboards";

interface Props {
    updateDash: (dashId: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SideBar({ updateDash, isOpen, onClose }: Props) {
    return (
        <>
            {isOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-30"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}
            <div
                className={`border-r max-w-70 w-70 border-r-gray-400 h-dvh gap-5 flex flex-col fixed md:static top-0 left-0 z-40 bg-gray-900 transition-transform duration-200 ${
                    isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                }`}
            >
                <div className="flex gap-2 items-center justify-between p-3">
                    <div className="flex gap-2 items-center min-w-0">
                        <div className="shrink-0 bg-blue-900 rounded-full h-14 w-14 flex justify-center items-center text-lg">
                            GB
                        </div>
                        <div className="flex flex-col text-sm min-w-0">
                            <span className="text-lg truncate">Guilherme Benevides</span>
                            <span className="truncate">gsbenevides2</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close menu"
                        className="md:hidden shrink-0 flex items-center justify-center size-8 rounded-md hover:bg-gray-800"
                    >
                        <XMarkIcon className="size-5" />
                    </button>
                </div>
                <div className="px-1 flex flex-col gap-0.5 overflow-y-auto">
                    {dashboards.map((dash) => (
                        <button
                            onClick={() => updateDash(dash.id)}
                            key={dash.id}
                            className="flex gap-1 items-center cursor-pointer hover:bg-gray-800 hover:duration-75 px-2 py-1 text-sm w-full rounded-sm"
                        >
                            <dash.icon className="size-6 shrink-0" />
                            <span className="truncate">{dash.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}
