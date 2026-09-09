import { useState } from "react";
import { PlusIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Button } from "core/ui/components/button";
import { Card } from "./component/card";
import { AddPlataform } from "./component/addPlataform";

function Dashboard() {
    const [isAddPlataformOpen, setIsAddPlataformOpen] = useState(false);
    return (
        <div className="p-3 flex flex-col gap-4">
            {isAddPlataformOpen && (
                <AddPlataform onClose={() => setIsAddPlataformOpen(false)} />
            )}
            <div className="flex justify-between">
                <h1 className="text-xl">Status Plataform</h1>
                <Button onClick={() => setIsAddPlataformOpen(true)}>
                    <PlusIcon className="size-4.5" />
                    <span>Add Plataform</span>
                </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <Card />
                <Card />
                <Card />
                <Card />
                <Card />
                <Card />
                <Card />
            </div>
        </div>
    );
}

export const statusPlataformDashboard: DashboardData = {
    id: "status-plataform",
    content: Dashboard,
    icon: ShieldCheckIcon,
    name: "Status Plataform",
};
