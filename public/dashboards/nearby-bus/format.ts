/** Line accents, from the integra palette (tailwind blue-400 / amber-400). */
export const LINE_COLORS: Record<string, string> = { "381": "#51a2ff", "215": "#ffb900" };
export const FALLBACK_LINE_COLOR = "#99a1af";

export const lineColor = (line: string) => LINE_COLORS[line] ?? FALLBACK_LINE_COLOR;

export const etaLabel = (min: number) => (min === 0 ? "Chegando" : `${min} min`);

/** "RIBEIRAO PIRES (TERMINAL RODOVIARIO …)" -> "Ribeirao Pires" */
export const placeName = (destination: string) =>
  destination
    .split(" (")[0]!
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** "SUZANO (BARUEL)" -> "Baruel": the branch that tells 381 from 215 on the Suzano side. */
export const lineBranch = (otherEnd: string) =>
  placeName(/\(([^)]+)\)/.exec(otherEnd)?.[1] ?? otherEnd);

/** "SP-031 Rod. Índio Tibiriçá, km 59 oeste - Recanto Feliz, …" -> "SP-031 Rod. Índio Tibiriçá, km 59 oeste" */
export const streetName = (address: string) => address.split(" - ")[0]!;
