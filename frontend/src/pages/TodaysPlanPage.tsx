import { TruckDepartureTable } from "../components/TruckDepartureTable";

export const TodaysPlanPage = () => {
  return (
    <>
      <h2 className="dashboard-page-title">Today's Departures</h2>
      <div className="dashboard-page-content">
        <TruckDepartureTable />
      </div>
    </>
  );
};
