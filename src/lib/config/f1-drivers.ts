// Static F1 driver details for the current season.
//
// Driver number → name / acronym / team is fixed for a season: numbers are
// allocated per driver for the year, and a mid-season seat change is rare
// enough to handle as an exception rather than pay for on every request.
//
// Previously every consumer that needed to label a row (last-race results,
// starting grid, championship tables, the settings roster chips, the layout)
// pulled `drivers?session_key=…` from OpenF1 — several calls per render, all
// returning the same 22 rows, and an empty/slow answer degraded the sidebar
// into "Car 63" placeholders. Holding the roster here removes those calls
// entirely and makes the labels deterministic.
//
// `lib/live/f1.ts` falls back to the live endpoint automatically when the
// running season no longer matches SEASON (see getDriverDetails), so this
// file going stale degrades to the old behaviour rather than breaking.

export interface F1DriverDetail {
  driverNumber: number;
  firstName: string;
  lastName: string;
  nameAcronym: string;
  teamName: string;
}

/** The season these entries describe. */
export const F1_DRIVER_SEASON = 2026;

export const F1_DRIVERS: F1DriverDetail[] = [
  { driverNumber: 1,  firstName: "Lando",     lastName: "Norris",     nameAcronym: "NOR", teamName: "McLaren" },
  { driverNumber: 3,  firstName: "Max",       lastName: "Verstappen", nameAcronym: "VER", teamName: "Red Bull Racing" },
  { driverNumber: 5,  firstName: "Gabriel",   lastName: "Bortoleto",  nameAcronym: "BOR", teamName: "Audi" },
  { driverNumber: 6,  firstName: "Isack",     lastName: "Hadjar",     nameAcronym: "HAD", teamName: "Red Bull Racing" },
  { driverNumber: 10, firstName: "Pierre",    lastName: "Gasly",      nameAcronym: "GAS", teamName: "Alpine" },
  { driverNumber: 11, firstName: "Sergio",    lastName: "Perez",      nameAcronym: "PER", teamName: "Cadillac" },
  { driverNumber: 12, firstName: "Kimi",      lastName: "Antonelli",  nameAcronym: "ANT", teamName: "Mercedes" },
  { driverNumber: 14, firstName: "Fernando",  lastName: "Alonso",     nameAcronym: "ALO", teamName: "Aston Martin" },
  { driverNumber: 16, firstName: "Charles",   lastName: "Leclerc",    nameAcronym: "LEC", teamName: "Ferrari" },
  { driverNumber: 18, firstName: "Lance",     lastName: "Stroll",     nameAcronym: "STR", teamName: "Aston Martin" },
  { driverNumber: 23, firstName: "Alexander", lastName: "Albon",      nameAcronym: "ALB", teamName: "Williams" },
  { driverNumber: 27, firstName: "Nico",      lastName: "Hulkenberg", nameAcronym: "HUL", teamName: "Audi" },
  { driverNumber: 30, firstName: "Liam",      lastName: "Lawson",     nameAcronym: "LAW", teamName: "Racing Bulls" },
  { driverNumber: 31, firstName: "Esteban",   lastName: "Ocon",       nameAcronym: "OCO", teamName: "Haas F1 Team" },
  { driverNumber: 41, firstName: "Arvid",     lastName: "Lindblad",   nameAcronym: "LIN", teamName: "Racing Bulls" },
  { driverNumber: 43, firstName: "Franco",    lastName: "Colapinto",  nameAcronym: "COL", teamName: "Alpine" },
  { driverNumber: 44, firstName: "Lewis",     lastName: "Hamilton",   nameAcronym: "HAM", teamName: "Ferrari" },
  { driverNumber: 55, firstName: "Carlos",    lastName: "Sainz",      nameAcronym: "SAI", teamName: "Williams" },
  { driverNumber: 63, firstName: "George",    lastName: "Russell",    nameAcronym: "RUS", teamName: "Mercedes" },
  { driverNumber: 77, firstName: "Valtteri",  lastName: "Bottas",     nameAcronym: "BOT", teamName: "Cadillac" },
  { driverNumber: 81, firstName: "Oscar",     lastName: "Piastri",    nameAcronym: "PIA", teamName: "McLaren" },
  { driverNumber: 87, firstName: "Oliver",    lastName: "Bearman",    nameAcronym: "BEA", teamName: "Haas F1 Team" },
];

export const F1_DRIVERS_BY_NUMBER: Map<number, F1DriverDetail> = new Map(
  F1_DRIVERS.map((d) => [d.driverNumber, d]),
);

/** Roster entry shape used by the settings/onboarding driver chips. */
export function staticRosterEntries() {
  return F1_DRIVERS.map((d) => ({
    id: d.nameAcronym.toLowerCase(),
    name: `${d.firstName} ${d.lastName}`,
    code: d.nameAcronym,
    team: d.teamName,
  }));
}
