import { dashboards } from "extensions/dashboards";

interface Props {
    updateDash: (dashId: string) => void;
}

export function SideBar({ updateDash }: Props) {
    return (
        <div className="border-r max-w-70 border-r-gray-400 h-dvh gap-5 flex flex-col">
            <div className="flex gap-2 items-center p-3">
                <div className="bg-blue-900 rounded-full h-14 w-14 flex justify-center items-center text-lg">
                    GB
                </div>
                <div className="flex flex-col text-sm">
                    <span className="text-lg">Guilherme Benevides</span>
                    <span>gsbenevides2</span>
                </div>
            </div>
            <div className="px-1 flex flex-col gap-0.5">
                {dashboards.map((dash) => (
                    <button
                        onClick={() => updateDash(dash.id)}
                        key={dash.id}
                        className="flex gap-1 items-center cursor-pointer hover:bg-gray-800 hover:duration-75 px-2 py-1 text-sm w-full rounded-sm"
                    >
                        <dash.icon className="size-6" />
                        <span>{dash.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
