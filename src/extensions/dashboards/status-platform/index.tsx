import { useCallback, useEffect, useState } from "react";
import { PlusIcon, ServerStackIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Button } from "core/ui/components/button";
import { useToast } from "core/ui/components/toast";
import type { Platform } from "utils/statusPlatform";
import { Card } from "./component/card";
import { CardSkeleton } from "./component/cardSkeleton";
import { PlatformFormModal, type PlatformFormValues } from "./component/platformFormModal";
import { getPlatformStatusEdenClient } from "extensions/scripts/platform-status/client";

interface PlatformRow {
    id: string;
    name: string;
    url: string;
    type: Platform;
}

function Dashboard() {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<PlatformFormValues>();
    const [platforms, setPlatforms] = useState<PlatformRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useToast();

    const fetchPlatforms = useCallback(
        async (useLoading: boolean) => {
            if (useLoading) {
                setIsLoading(true);
            }
            const client = getPlatformStatusEdenClient();
            const { data, error } = await client["platform-stats"]["list-platforms"].get();
            if (error) {
                showToast("Failed to fetch platforms", "error");
            } else {
                setPlatforms(data ?? []);
            }
            if (useLoading) {
                setIsLoading(false);
            }
        },
        [showToast],
    );

    useEffect(() => {
        fetchPlatforms(true);
        const interval = setInterval(() => {
            fetchPlatforms(false);
        }, 4000);
        return () => {
            clearInterval(interval);
        };
    }, [fetchPlatforms]);

    const openCreateModal = useCallback(() => {
        setEditingPlatform(undefined);
        setIsFormModalOpen(true);
    }, []);

    const openEditModal = useCallback((platform: PlatformFormValues) => {
        setEditingPlatform(platform);
        setIsFormModalOpen(true);
    }, []);

    return (
        <div className="p-3 flex flex-col gap-4">
            <PlatformFormModal
                onClose={() => setIsFormModalOpen(false)}
                onSaved={() => fetchPlatforms(true)}
                isOpen={isFormModalOpen}
                platform={editingPlatform}
            />

            <div className="flex justify-between">
                <h1 className="text-xl">Status Platform</h1>
                <Button onClick={openCreateModal}>
                    <PlusIcon className="size-4.5" />
                    <span>Add Platform</span>
                </Button>
            </div>
            {isLoading ? (
                <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <CardSkeleton key={index} />
                    ))}
                </div>
            ) : platforms.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <ServerStackIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">No platforms registered yet</p>
                    <p className="text-sm text-mist-400">
                        Add a platform to start tracking its status here.
                    </p>
                    <Button className="mt-2" onClick={openCreateModal}>
                        <PlusIcon className="size-4.5" />
                        <span>Add Platform</span>
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {platforms.map((platform) => (
                        <Card
                            key={platform.id}
                            id={platform.id}
                            name={platform.name}
                            url={platform.url}
                            type={platform.type}
                            onDeleted={() => fetchPlatforms(true)}
                            onEdit={() => openEditModal(platform)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export const statusPlatformDashboard: DashboardData = {
    id: "status-platform",
    content: Dashboard,
    icon: ShieldCheckIcon,
    name: "Status Platform",
};
