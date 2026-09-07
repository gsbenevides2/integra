import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";

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
                    <button className="cursor-pointer hover:bg-gray-500 p-1 rounded-full">
                        <PencilIcon className="size-4.5" />
                    </button>
                    <button className="cursor-pointer hover:bg-gray-500 p-1 rounded-full">
                        <TrashIcon className="size-4.5" />
                    </button>
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
