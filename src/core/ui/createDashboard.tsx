export interface DashboardData {
    id: string;
    name: string;
    icon: React.ForwardRefExoticComponent<
        Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
            title?: string;
            titleId?: string;
        } & React.RefAttributes<SVGSVGElement>
    >;
    content: () => React.JSX.Element;
}

export function createDashboard(settings: DashboardData) {
    return settings;
}
