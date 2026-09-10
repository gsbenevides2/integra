import { PencilIcon, TrashIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";
import { useConfirm } from "core/ui/components/confirm";
import { useToast } from "core/ui/components/toast";
import { getPlatformStatusEdenClient } from "extensions/scripts/platform-status/client";
import { useCallback, useState } from "react";
import type { Platform } from "utils/statusPlatform";

interface Props {
    id: string;
    name: string;
    url: string;
    type: Platform;
    status: "OK" | "DOWN" | null;
    problemDescription: string | null;
    onDeleted: () => void;
    onEdit: () => void;
    onOpenHistory: () => void;
}

export function Card({
    id,
    name,
    url,
    type,
    status,
    problemDescription,
    onDeleted,
    onEdit,
    onOpenHistory,
}: Props) {
    const [isDeleting, setIsDeleting] = useState(false);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const deletePlatform = useCallback(async () => {
        const confirmed = await confirm({
            title: "Delete platform",
            message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
            confirmLabel: "Delete",
        });
        if (!confirmed) return;

        const client = getPlatformStatusEdenClient();

        setIsDeleting(true);
        client["platform-stats"]({ id })
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
            className={`bg-gray-800 p-2 text-sm rounded-md flex flex-col gap-1 transition-opacity cursor-pointer hover:bg-gray-700 ${
                isDeleting ? "opacity-50 pointer-events-none" : ""
            }`}
            onClick={onOpenHistory}
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
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        disabled={isDeleting}
                    >
                        <PencilIcon className="size-4.5" />
                    </IconButton>
                    <IconButton
                        className="hover:bg-gray-500"
                        onClick={(e) => {
                            e.stopPropagation();
                            deletePlatform();
                        }}
                        disabled={isDeleting}
                    >
                        <TrashIcon className="size-4.5" />
                    </IconButton>
                    <IconButton
                        className="hover:bg-gray-500"
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(url);
                        }}
                        disabled={isDeleting}
                    >
                        <ArrowTopRightOnSquareIcon className="size-4.5" />
                    </IconButton>
                </div>
            </div>
            <div>
                <div className="flex gap-1 items-center">
                    <div
                        className={`h-2 w-2 rounded-full ${
                            status === "OK"
                                ? "bg-green-700"
                                : status === "DOWN"
                                  ? "bg-red-700"
                                  : "bg-gray-600"
                        }`}
                    />
                    <p>
                        Status:{" "}
                        {status === "OK"
                            ? "Operational"
                            : status === "DOWN"
                              ? "Down"
                              : "Not checked yet"}
                    </p>
                </div>
                {status === "DOWN" && problemDescription && (
                    <p className="text-red-400 text-xs mt-0.5">{problemDescription}</p>
                )}
            </div>
        </div>
    );
}
