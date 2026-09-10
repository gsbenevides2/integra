import { XMarkIcon } from "@heroicons/react/24/outline";
import { PLATAFORMS, type Plataform } from "utils/statusPlataform";
import { Button } from "core/ui/components/button";
import { IconButton } from "core/ui/components/iconButton";
import { Input } from "core/ui/components/input";
import { Select } from "core/ui/components/select";
import { useToast } from "core/ui/components/toast";
import { useCallback, useState } from "react";
import { getPlataformStatusEdenClient } from "extensions/scripts/plataform-status/client";

interface Props {
    onClose: () => void;
    onSaved: () => void;
    isOpen: boolean;
}

function isValidPlataform(value: string): value is Plataform {
    return PLATAFORMS.includes(value as Plataform);
}

export function AddPlataform({ onClose, onSaved, isOpen }: Props) {
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();

    const savePlataform = useCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = formData.get("name")?.toString();
            const type = formData.get("type")?.toString();
            const url = formData.get("url")?.toString();
            if (!name) return showToast("Missing name!", "error");
            if (!type) return showToast("Missing type", "error");
            if (!url) return showToast("Missing url", "error");
            if (!isValidPlataform(type)) return showToast("Invalid type", "error");

            const client = getPlataformStatusEdenClient();

            setIsSaving(true);
            client["plataform-stats"].new
                .post({
                    name,
                    type,
                    url,
                })
                .then(() => {
                    showToast("Salvo com sucesso", "success");
                    onSaved();
                    onClose();
                })
                .catch(() => {
                    showToast("Erro ao salvar", "error");
                })
                .finally(() => {
                    setIsSaving(false);
                });
        },
        [onClose, onSaved, showToast],
    );

    return (
        <div
            className={`fixed inset-0 z-50 bg-mist-950/90 backdrop-blur-sm flex justify-center items-center p-4 transition-opacity duration-200 ${
                isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={`bg-gray-800 w-full max-w-sm rounded-lg shadow-xl flex flex-col gap-4 p-4 transition-all duration-200 ${
                    isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Add Plataform</h3>
                    <IconButton type="button" onClick={onClose}>
                        <XMarkIcon className="size-4.5" />
                    </IconButton>
                </div>
                <form className="flex flex-col gap-3" onSubmit={savePlataform}>
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
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" isLoading={isSaving}>
                            Save
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
