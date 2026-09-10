import { useCallback, useEffect, useState } from "react";
import { PlusIcon, ServerStackIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Button } from "core/ui/components/button";
import { useToast } from "core/ui/components/toast";
import type { Plataform } from "utils/statusPlataform";
import { Card } from "./component/card";
import { CardSkeleton } from "./component/cardSkeleton";
import { AddPlataform } from "./component/addPlataform";
import { getPlataformStatusEdenClient } from "extensions/scripts/plataform-status/client";

interface PlataformRow {
    id: string;
    name: string;
    url: string;
    type: Plataform;
}

function Dashboard() {
    const [isAddPlataformOpen, setIsAddPlataformOpen] = useState(false);
    const [plataforms, setPlataforms] = useState<PlataformRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useToast();

    const fetchPlataforms = useCallback(
        async (useLoading: boolean) => {
            if (useLoading) {
                setIsLoading(true);
            }
            const client = getPlataformStatusEdenClient();
            const { data, error } = await client["plataform-stats"]["list-plataforms"].get();
            if (error) {
                showToast("Erro ao buscar plataformas", "error");
            } else {
                setPlataforms(data ?? []);
            }
            if (useLoading) {
                setIsLoading(false);
            }
        },
        [showToast],
    );

    useEffect(() => {
        fetchPlataforms(true);
        const interval = setInterval(() => {
            fetchPlataforms(false);
        }, 4000);
        return () => {
            clearInterval(interval);
        };
    }, [fetchPlataforms]);

    return (
        <div className="p-3 flex flex-col gap-4">
            <AddPlataform
                onClose={() => setIsAddPlataformOpen(false)}
                onSaved={() => fetchPlataforms(true)}
                isOpen={isAddPlataformOpen}
            />

            <div className="flex justify-between">
                <h1 className="text-xl">Status Plataform</h1>
                <Button onClick={() => setIsAddPlataformOpen(true)}>
                    <PlusIcon className="size-4.5" />
                    <span>Add Plataform</span>
                </Button>
            </div>
            {isLoading ? (
                <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <CardSkeleton key={index} />
                    ))}
                </div>
            ) : plataforms.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <ServerStackIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">Nenhuma plataforma cadastrada ainda</p>
                    <p className="text-sm text-mist-400">
                        Adicione uma plataforma para começar a acompanhar o status dela por aqui.
                    </p>
                    <Button className="mt-2" onClick={() => setIsAddPlataformOpen(true)}>
                        <PlusIcon className="size-4.5" />
                        <span>Add Plataform</span>
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {plataforms.map((plataform) => (
                        <Card
                            key={plataform.id}
                            name={plataform.name}
                            url={plataform.url}
                            type={plataform.type}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export const statusPlataformDashboard: DashboardData = {
    id: "status-plataform",
    content: Dashboard,
    icon: ShieldCheckIcon,
    name: "Status Plataform",
};
