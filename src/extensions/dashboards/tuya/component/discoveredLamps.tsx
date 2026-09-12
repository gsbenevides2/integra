import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "core/ui/components/button";
import type { DiscoveredDevice } from "../types";

interface Props {
    devices: DiscoveredDevice[];
    onRegister: (device: DiscoveredDevice) => void;
}

export function DiscoveredLamps({ devices, onRegister }: Props) {
    if (devices.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-mist-300">
                Encontradas na rede ({devices.length})
            </h2>
            <p className="text-xs text-mist-400">
                Descobertas pelo broadcast UDP. Para cadastrar, você precisa da localKey do
                dispositivo.
            </p>
            <div className="bg-gray-800 rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-mist-400 border-b border-gray-700">
                            <th className="font-normal py-2 px-3">Device ID</th>
                            <th className="font-normal py-2 px-3">IP</th>
                            <th className="font-normal py-2 px-3">Protocolo</th>
                            <th className="font-normal py-2 px-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {devices.map((device) => (
                            <tr
                                key={device.deviceId}
                                className="border-b border-gray-700 last:border-0"
                            >
                                <td className="py-2 px-3 font-mono text-xs">{device.deviceId}</td>
                                <td className="py-2 px-3 text-mist-300">{device.ip}</td>
                                <td className="py-2 px-3 text-mist-300">
                                    {device.version ?? "desconhecido"}
                                </td>
                                <td className="py-2 px-3">
                                    <div className="flex justify-end">
                                        <Button
                                            variant="secondary"
                                            onClick={() => onRegister(device)}
                                        >
                                            <PlusIcon className="size-4" /> Cadastrar
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
