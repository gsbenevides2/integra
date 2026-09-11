import { TrashIcon } from "@heroicons/react/24/outline";
import { IconButton } from "core/ui/components/iconButton";
import { useConfirm } from "core/ui/components/confirm";
import { useToast } from "core/ui/components/toast";
import { getGoogleAccountsEdenClient } from "extensions/scripts/google-accounts/client";
import { useCallback, useState } from "react";

interface Props {
    email: string;
    onDeleted: () => void;
}

export function Card({ email, onDeleted }: Props) {
    const [isDeleting, setIsDeleting] = useState(false);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const deleteAccount = useCallback(async () => {
        const confirmed = await confirm({
            title: "Delete account",
            message: `Are you sure you want to delete "${email}"? This will remove its stored Google credentials.`,
            confirmLabel: "Delete",
        });
        if (!confirmed) return;

        const client = getGoogleAccountsEdenClient();

        setIsDeleting(true);
        client["google-accounts"].accounts({ email }).delete()
            .then(({ error }) => {
                if (error) {
                    showToast("Failed to delete account", "error");
                    return;
                }
                showToast("Account deleted successfully", "success");
                onDeleted();
            })
            .catch(() => {
                showToast("Failed to delete account", "error");
            })
            .finally(() => {
                setIsDeleting(false);
            });
    }, [confirm, email, onDeleted, showToast]);

    return (
        <div
            className={`bg-gray-800 p-2 text-sm rounded-md flex items-center justify-between transition-opacity ${
                isDeleting ? "opacity-50 pointer-events-none" : ""
            }`}
        >
            <span className="font-medium">{email}</span>
            <IconButton className="hover:bg-gray-500" onClick={deleteAccount} disabled={isDeleting}>
                <TrashIcon className="size-4.5" />
            </IconButton>
        </div>
    );
}
