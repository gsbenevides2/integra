import { JsonViewer } from "@textea/json-viewer";
import { useState } from "react";

interface Props {
    data: Record<string, unknown>;
}

export function JsonTreeView({ data }: Props) {
    const [viewerKey, setViewerKey] = useState(0);
    const [inspectDepth, setInspectDepth] = useState<number>(0);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <button
                    type="button"
                    className="text-xs px-2 py-0.5 rounded-md hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                        setInspectDepth(10);
                        setViewerKey((prev) => prev + 1);
                    }}
                >
                    Expandir tudo
                </button>
                <button
                    type="button"
                    className="text-xs px-2 py-0.5 rounded-md hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                        setInspectDepth(0);
                        setViewerKey((prev) => prev + 1);
                    }}
                >
                    Colapsar tudo
                </button>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-md p-2">
                <JsonViewer
                    key={viewerKey}
                    value={data}
                    theme="dark"
                    displayDataTypes={false}
                    enableClipboard={false}
                    rootName={false}
                    defaultInspectDepth={inspectDepth}
                    collapseStringsAfterLength={120}
                    className="!bg-transparent"
                />
            </div>
        </div>
    );
}
