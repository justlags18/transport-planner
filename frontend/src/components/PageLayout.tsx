import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type PageLayoutProps = {
  children?: React.ReactNode;
};

export const PageLayout = ({ children }: PageLayoutProps) => {
  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-main">
        <TopBar />
        <main className="dashboard-content" role="main">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
};
