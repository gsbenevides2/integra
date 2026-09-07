import { dashboards } from "extensions/dashboards";

interface Props {
    selectedDash?: string;
}

export function Content({ selectedDash }: Props) {
    if (!selectedDash) return <></>;
    const dashData = dashboards.find((d) => d.id === selectedDash);
    if (!dashData) return <></>;
    return <dashData.content />;
}
