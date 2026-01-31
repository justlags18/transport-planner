export type DepartureStatus = "Ready" | "Loading" | "Full" | "Over capacity";

export type TruckDepartureRow = {
  truckReg: string;
  truckLocation: string;
  departureTime: string;
  loadSummary: string;
  status: DepartureStatus;
};

const DEMO_ROWS: TruckDepartureRow[] = [
  { truckReg: "AB12 CDE", truckLocation: "Kent", departureTime: "06:30", loadSummary: "18 / 26 pallets", status: "Ready" },
  { truckReg: "XY98 ZYX", truckLocation: "Manchester", departureTime: "07:15", loadSummary: "22 / 26 pallets", status: "Loading" },
  { truckReg: "LN54 KNO", truckLocation: "Birmingham", departureTime: "08:00", loadSummary: "26 / 26 pallets", status: "Full" },
  { truckReg: "EF34 GHI", truckLocation: "Leeds", departureTime: "08:45", loadSummary: "28 / 26 pallets", status: "Over capacity" },
  { truckReg: "PQ77 RST", truckLocation: "Southampton", departureTime: "09:30", loadSummary: "14 / 26 pallets", status: "Ready" },
  { truckReg: "UV22 WXY", truckLocation: "Bristol", departureTime: "10:00", loadSummary: "24 / 26 pallets", status: "Loading" },
];

const COLUMNS: { key: keyof TruckDepartureRow; label: string }[] = [
  { key: "truckReg", label: "Truck Reg" },
  { key: "truckLocation", label: "Truck Location" },
  { key: "departureTime", label: "Departure Time" },
  { key: "loadSummary", label: "Load Summary" },
  { key: "status", label: "Status" },
];

export const TruckDepartureTable = () => {
  return (
    <table className="departure-table" role="grid" aria-label="Today's truck departures">
      <thead>
        <tr>
          {COLUMNS.map(({ key, label }) => (
            <th key={key} className={key === "status" ? "departure-table-status" : undefined}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {DEMO_ROWS.map((row, index) => (
          <tr key={`${row.truckReg}-${index}`}>
            <td>{row.truckReg}</td>
            <td>{row.truckLocation}</td>
            <td>{row.departureTime}</td>
            <td>{row.loadSummary}</td>
            <td className="departure-table-status">
              <span className={`departure-table-pill departure-table-pill--${row.status.toLowerCase().replace(" ", "-")}`}>
                {row.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
