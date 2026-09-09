import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
    onClose: () => void;
}

export function AddPlataform({ onClose }: Props) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsVisible(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <div
            className={`fixed inset-0 z-50 bg-mist-950/90 backdrop-blur-sm flex justify-center items-center p-4 transition-opacity duration-200 ${
                isVisible ? "opacity-100" : "opacity-0"
            }`}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={`bg-gray-800 w-full max-w-sm rounded-lg shadow-xl flex flex-col gap-4 p-4 transition-all duration-200 ${
                    isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Add Plataform</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="cursor-pointer hover:bg-gray-700 p-1 rounded-full"
                    >
                        <XMarkIcon className="size-5" />
                    </button>
                </div>
                <form className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="name" className="text-xs text-mist-300">
                            Name
                        </label>
                        <input
                            className="border border-mist-600 bg-gray-900 p-2 rounded-md outline-0 focus:border-mist-300 transition-colors"
                            type="text"
                            id="name"
                            placeholder="Type the plataform name"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="url" className="text-xs text-mist-300">
                            Url
                        </label>
                        <input
                            className="border border-mist-600 bg-gray-900 p-2 rounded-md outline-0 focus:border-mist-300 transition-colors"
                            type="text"
                            id="url"
                            placeholder="Type the plataform url"
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-sm px-3 py-1.5 rounded-md hover:bg-gray-700 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="text-sm px-3 py-1.5 rounded-md bg-mist-900 hover:bg-mist-600 cursor-pointer"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
