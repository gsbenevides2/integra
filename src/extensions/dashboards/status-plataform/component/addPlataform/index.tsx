import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { PLATAFORMS } from "extensions/db/plataform-status";
import { Button } from "core/ui/components/button";
import { IconButton } from "core/ui/components/iconButton";
import { Input } from "core/ui/components/input";
import { Select } from "core/ui/components/select";

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
                    <IconButton type="button" onClick={onClose}>
                        <XMarkIcon className="size-4.5" />
                    </IconButton>
                </div>
                <form className="flex flex-col gap-3">
                    <Input
                        label="Name"
                        type="text"
                        id="name"
                        placeholder="Type the plataform name"
                    />
                    <Input label="Url" type="text" id="url" placeholder="Type the plataform url" />
                    <Select
                        label="Type"
                        id="type"
                        defaultValue=""
                        placeholder="Select the plataform type"
                        options={PLATAFORMS.map((plataform) => ({
                            label: plataform,
                            value: plataform,
                        }))}
                    />
                    <div className="flex justify-end gap-2 mt-1">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary">
                            Save
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
