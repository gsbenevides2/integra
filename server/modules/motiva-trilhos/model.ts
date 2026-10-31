export const APIM_HOST = "https://apim-appsitemobilidade-prd-brazilsouth-001.azure-api.net";

export interface CommuteLeg {
  id: string;
  label: string;
  line: "4" | "9";
  trip: "to-work" | "to-home";
  concessionaire: "VQ" | "VM";
  track: "4" | "9";
  station: string;
  /** Matches the `direction` field of the next-train response for this leg. */
  direction: string;
}

/** Home → work: Luz (Amarela) to Pinheiros, then Pinheiros (Esmeralda) to Morumbi. Reverse coming home. */
export const COMMUTE_LEGS: CommuteLeg[] = [
  {
    id: "luz-pinheiros", label: "Luz → Pinheiros", line: "4", trip: "to-work",
    concessionaire: "VQ", track: "4", station: "LUZ", direction: "Vila Sônia Profa. Elisabeth Tenreiro",
  },
  {
    id: "pinheiros-morumbi", label: "Pinheiros → Morumbi", line: "9", trip: "to-work",
    concessionaire: "VM", track: "9", station: "PIN", direction: "Varginha",
  },
  {
    id: "morumbi-pinheiros", label: "Morumbi → Pinheiros", line: "9", trip: "to-home",
    concessionaire: "VM", track: "9", station: "MRB", direction: "Osasco",
  },
  {
    id: "pinheiros-luz", label: "Pinheiros → Luz", line: "4", trip: "to-home",
    concessionaire: "VQ", track: "4", station: "PIH", direction: "Luz",
  },
];

export interface NextTrainEntry {
  direction: string;
  /** ISO timestamp, or "" when the line isn't operating right now. */
  expectedArrivalTime: string;
}

export interface LegStatus {
  id: string;
  label: string;
  line: "4" | "9";
  trip: "to-work" | "to-home";
  /** Minutes until arrival, undefined when the line has no data (e.g. outside operating hours). */
  etaMin?: number;
}
