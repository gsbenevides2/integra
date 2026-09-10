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
}

export function Card({ id, name, url, type, onDeleted }: Props) {
    const [isDeleting, setIsDeleting] = useState(false);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const deletePlataform = useCallback(async () => {
        const confirmed = await confirm({
            title: "Excluir plataforma",
            message: `Deseja realmente excluir "${name}"? Essa ação não pode ser desfeita.`,
            confirmLabel: "Excluir",
        });
        if (!confirmed) return;

        const client = getPlataformStatusEdenClient();

        setIsDeleting(true);
        client["plataform-stats"]({ id })
            .delete()
            .then(({ error }) => {
                if (error) {
                    showToast("Erro ao excluir plataforma", "error");
                    return;
                }
                showToast("Plataforma excluída com sucesso", "success");
                onDeleted();
            })
            .catch(() => {
                showToast("Erro ao excluir plataforma", "error");
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
                    <p>Nome: {name}</p>
                    <p>URL: {url}</p>
                    <p>Tipo: {type}</p>
                </div>
                <div className="flex flex-col gap-0.5">
                    <IconButton className="hover:bg-gray-500">
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
                    <p>Status: Operacional</p>
                </div>
                <div className="flex gap-1 items-center">
                    <div className="h-2 w-2 rounded-full" />
                    <p>Sistemas fora do ar</p>
                </div>
            </div>
        </div>
    );
}
