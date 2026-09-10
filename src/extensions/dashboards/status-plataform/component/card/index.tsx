import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";
import { useConfirm } from "core/ui/components/confirm";
import { useToast } from "core/ui/components/toast";
import { getPlataformStatusEdenClient } from "extensions/scripts/plataform-status/client";
import { useCallback, useState } from "react";
import type { Plataform } from "utils/statusPlataform";

interface Props {
    id: string;
    name: string;
    url: string;
    type: Plataform;
    onDeleted: () => void;
    onEdit: () => void;
}

export function Card({ id, name, url, type, onDeleted, onEdit }: Props) {
    const [isDeleting, setIsDeleting] = useState(false);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const deletePlataform = useCallback(async () => {
        const confirmed = await confirm({
            title: "Delete platform",
            message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
            confirmLabel: "Delete",
        });
        if (!confirmed) return;

        const client = getPlataformStatusEdenClient();

        setIsDeleting(true);
        client["plataform-stats"]({ id })
            .delete()
            .then(({ error }) => {
                if (error) {
                    showToast("Failed to delete platform", "error");
                    return;
                }
                showToast("Platform deleted successfully", "success");
                onDeleted();
            })
            .catch(() => {
                showToast("Failed to delete platform", "error");
            })
            .finally(() => {
                setIsDeleting(false);
            });
    }, [confirm, id, name, onDeleted, showToast]);

    return (
        <div
            className={`bg-gray-800 p-2 text-sm rounded-md flex flex-col gap-1 transition-opacity ${
                isDeleting ? "opacity-50 pointer-events-none" : ""
            }`}
        >
            <div className="flex justify-between">
                <div>
                    <p>Name: {name}</p>
                    <p>URL: {url}</p>
                    <p>Type: {type}</p>
                </div>
                <div className="flex flex-col gap-0.5">
                    <IconButton
                        className="hover:bg-gray-500"
                        onClick={onEdit}
                        disabled={isDeleting}
                    >
                        <PencilIcon className="size-4.5" />
                    </IconButton>
                    <IconButton
                        className="hover:bg-gray-500"
                        onClick={deletePlataform}
                        disabled={isDeleting}
                    >
                        <TrashIcon className="size-4.5" />
                    </IconButton>
                </div>
            </div>
            <div>
                <div className="flex gap-1 items-center">
                    <div className="bg-green-700 h-2 w-2 rounded-full" />
                    <p>Status: Operational</p>
                </div>
                <div className="flex gap-1 items-center">
                    <div className="h-2 w-2 rounded-full" />
                    <p>Systems down</p>
                </div>
            </div>
        </div>
    );
}
