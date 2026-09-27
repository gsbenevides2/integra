import React, {
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";

import { googleAccountsDashboard } from "@public/dashboards/google-accounts";
import { serverMetricsDashboard } from "@public/dashboards/server-metrics";
import { statusPlatformDashboard } from "@public/dashboards/status-platform";
import { tplinkDashboard } from "@public/dashboards/tplink";
import { trainStatusDashboard } from "@public/dashboards/train-status";
import { tuyaDashboard } from "@public/dashboards/tuya";

import { Drawer } from "../Drawer";
import { Content } from "./Content";

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

interface GlobalDrawerContextValue {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  page: string;
  setPage: React.Dispatch<React.SetStateAction<string>>;
  dashboardList: DashboardData[];
}

const DASHBOARD_LIST: DashboardData[] = [
  tuyaDashboard,
  googleAccountsDashboard,
  trainStatusDashboard,
  statusPlatformDashboard,
  serverMetricsDashboard,
  tplinkDashboard,
];

const DEFAULT_STATE: GlobalDrawerContextValue = {
  isOpen: false,
  setIsOpen: () => {},
  page: "",
  setPage: () => {},
  dashboardList: DASHBOARD_LIST,
};

const GlobalDrawerContext =
  createContext<GlobalDrawerContextValue>(DEFAULT_STATE);

export function GlobalDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState<string>(DASHBOARD_LIST[0]?.id);
  const CurrentPageContent = DASHBOARD_LIST.find((d) => d.id === page)?.content;
  return (
    <GlobalDrawerContext.Provider
      value={{
        isOpen,
        setIsOpen,
        page,
        setPage,
        dashboardList: DASHBOARD_LIST,
      }}
    >
      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Menu"
        direction="left"
        size="small"
        removePadding
        customContainerClassNames="h-full flex-1 max-h-[calc(100dvh-61px)]"
      >
        <Content />
      </Drawer>
      {CurrentPageContent && <CurrentPageContent />}
      {children}
    </GlobalDrawerContext.Provider>
  );
}

export const useGlobalDrawer = () => {
  return useContext(GlobalDrawerContext);
};
