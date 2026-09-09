import { PlusIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Card } from "./component/card";
import { AddPlataform } from "./component/addPlataform";

function Dashboard() {
    return (
        <div className="p-3 flex flex-col gap-4">
            <AddPlataform />
            <div className="flex justify-between">
                <h1 className="text-xl">Status Plataform</h1>
                <button className="text-sm flex bg-mist-800 p-2 rounded-sm hover:bg-mist-600 cursor-pointer">
                    <PlusIcon className="size-4.5" />
                    <span>Add Plataform</span>
                </button>
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
