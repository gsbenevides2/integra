import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";

export function Card() {
    return (
        <div className="bg-gray-800 p-2 text-sm rounded-md flex flex-col gap-1">
            <div className="flex justify-between">
                <div>
                    <p>Nome: Github</p>
                    <p>URL: https://status.github.com</p>
                    <p>Tipo: Atlasian</p>
                </div>
                <div className="flex flex-col gap-0.5">
                    <IconButton className="hover:bg-gray-500">
                        <PencilIcon className="size-4.5" />
                    </IconButton>
                    <IconButton className="hover:bg-gray-500">
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
