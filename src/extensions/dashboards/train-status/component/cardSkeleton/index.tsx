export function CardSkeleton() {
    return (
        <div className="bg-gray-800 p-2 text-sm rounded-md flex flex-col gap-1 animate-pulse">
            <div className="flex items-center gap-2">
                <div className="size-3.5 bg-gray-700 rounded-full" />
                <div className="h-3.5 w-20 bg-gray-700 rounded-sm" />
            </div>
            <div className="h-3.5 w-36 bg-gray-700 rounded-sm" />
            <div className="flex flex-col gap-1.5 mt-1">
                <div className="h-3.5 w-28 bg-gray-700 rounded-sm" />
            </div>
        </div>
    );
}
