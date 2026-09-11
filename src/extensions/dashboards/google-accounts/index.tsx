import { ArrowPathIcon, PlusIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Button } from "core/ui/components/button";
import { useToast } from "core/ui/components/toast";
import { getGoogleAccountsEdenClient } from "extensions/scripts/google-accounts/client";
import { useCallback, useEffect, useState } from "react";
import { Card } from "./component/card";

function Dashboard() {
    const [accounts, setAccounts] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { showToast } = useToast();

    const fetchAccounts = useCallback(async () => {
        setIsLoading(true);
        const client = getGoogleAccountsEdenClient();
        const { data, error } = await client["google-accounts"].accounts.get();
        if (error) {
            showToast("Failed to fetch Google accounts", "error");
        } else {
            setAccounts(data?.accounts ?? []);
        }
        setIsLoading(false);
    }, [showToast]);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("googleAccountAdded")) {
            showToast("Google account added successfully", "success");
            fetchAccounts();
        } else if (params.has("googleAccountError")) {
            showToast("Failed to add Google account", "error");
        } else {
            return;
        }
        params.delete("googleAccountAdded");
        params.delete("googleAccountError");
        const search = params.toString();
        window.history.replaceState(
            {},
            "",
            window.location.pathname + (search ? `?${search}` : ""),
        );
    }, [fetchAccounts, showToast]);

    return (
        <div className="p-3 flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h1 className="text-xl">Google Accounts</h1>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" isLoading={isLoading} onClick={fetchAccounts}>
                        <ArrowPathIcon className="size-4" />
                        Refresh
                    </Button>
                    <Button onClick={() => window.open("/google-accounts/oauth/start", "_blank")}>
                        <PlusIcon className="size-4.5" />
                        Add account
                    </Button>
                </div>
            </div>

            {isLoading && accounts.length === 0 ? (
                <div className="h-50 flex items-center justify-center text-mist-400 text-sm">
                    Loading accounts...
                </div>
            ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <UserGroupIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">No Google accounts registered yet</p>
                    <p className="text-sm text-mist-400">
                        Click "Add account" to authorize a new Google account.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {accounts.map((email) => (
                        <Card key={email} email={email} onDeleted={fetchAccounts} />
                    ))}
                </div>
            )}
        </div>
    );
}

export const googleAccountsDashboard: DashboardData = {
    id: "google-accounts",
    content: Dashboard,
    icon: UserGroupIcon,
    name: "Google Accounts",
};
