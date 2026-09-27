import React, { useCallback, useEffect, useState } from "react";

import type { Platform } from "@server/modules/status-platform/model";
import { Button } from "@public/components/Button";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  Bars3Icon,
  PlusIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { getStatusPlatformEdenClient } from "./client";
import { Card } from "./component/Card";
import { CardSkeleton } from "./component/CardSkeleton";
import { HistoryModal } from "./component/HistoryModal";
import {
  PlatformFormModal,
  type PlatformFormValues,
} from "./component/PlatformFormModal";

interface PlatformRow {
  id: string;
  name: string;
  url: string;
  type: Platform;
  status: "OK" | "DOWN" | null;
  problemDescription: string | null;
  lastCheckedAt: Date | string | null;
}

function StatusPlatformDashboard() {
  const globalDrawer = useGlobalDrawer();
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<PlatformFormValues>();
  const [historyPlatform, setHistoryPlatform] = useState<{
    id: string;
    name: string;
  }>();
  const [platforms, setPlatforms] = useState<PlatformRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const fetchPlatforms = useCallback(
    async (useLoading: boolean) => {
      if (useLoading) setIsLoading(true);
      const { data, error } = await getStatusPlatformEdenClient().api[
        "status-platform"
      ].list.get();
      if (error) {
        showToast("Failed to fetch platforms", "error");
      } else {
        setPlatforms(data ?? []);
      }
      if (useLoading) setIsLoading(false);
    },
    [showToast],
  );

  useEffect(() => {
    fetchPlatforms(true);
    const interval = setInterval(() => fetchPlatforms(false), 4000);
    return () => clearInterval(interval);
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
    <div className="flex flex-col gap-4 p-3">
      <PlatformFormModal
        onClose={() => setIsFormModalOpen(false)}
        onSaved={() => fetchPlatforms(true)}
        isOpen={isFormModalOpen}
        platform={editingPlatform}
      />

      <HistoryModal
        isOpen={Boolean(historyPlatform)}
        onClose={() => setHistoryPlatform(undefined)}
        platformId={historyPlatform?.id}
        platformName={historyPlatform?.name}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => globalDrawer.setIsOpen(true)}
            aria-label="Abrir menu"
          >
            <Bars3Icon className="size-5" />
          </IconButton>
          <h1 className="text-xl">Status Platform</h1>
        </div>
        <Button onClick={openCreateModal}>
          <PlusIcon className="size-4.5" />
          <span>Add Platform</span>
        </Button>
      </div>
      {isLoading ? (
        <div className="
          grid grid-cols-1 gap-2
          sm:grid-cols-2
          lg:grid-cols-3
        ">
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
        <div className="
          grid grid-cols-1 gap-2
          sm:grid-cols-2
          lg:grid-cols-3
        ">
          {platforms.map((platform) => (
            <Card
              key={platform.id}
              id={platform.id}
              name={platform.name}
              url={platform.url}
              type={platform.type}
              status={platform.status}
              problemDescription={platform.problemDescription}
              onDeleted={() => fetchPlatforms(true)}
              onEdit={() => openEditModal(platform)}
              onOpenHistory={() =>
                setHistoryPlatform({ id: platform.id, name: platform.name })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const statusPlatformDashboard: DashboardData = {
  id: "status-platform",
  content: StatusPlatformDashboard,
  icon: ShieldCheckIcon,
  name: "Status Platform",
};
