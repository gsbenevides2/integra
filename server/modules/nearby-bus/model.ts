export const NEARBY_BUS_LINES = ["381", "215"] as const;
export const RADIUS_M = 150;
export const STALE_MS = 5 * 60_000;
export const DEFAULT_SPEED_KMH = 20;
export const MAX_ARRIVALS = 3;

export interface PortalStop {
  latitude: number;
  longitude: number;
  endereco: string;
}

export interface PortalRoute {
  sentido: "ida" | "volta";
  destino: string;
  encode: string;
  pontos: PortalStop[];
  horariosdiasuteis: string;
  horariossabados: string;
  horariosdomingosferiados: string;
}

export interface PortalVehicle {
  prefixo: string;
  sentidoLinha: "ida" | "volta";
  latitude: number;
  longitude: number;
  dataUltimaTransmissao: number;
  dentroRota: boolean;
}

export interface PortalLine {
  codigo: string;
  velocidadeMedia: number;
  veiculos: PortalVehicle[];
  rotas: PortalRoute[];
}

export interface Arrival {
  source: "live" | "schedule";
  /** Minutes until the bus reaches the stop (live) or until the departure (schedule). */
  etaMin: number;
  vehicle?: string;
  /** Vehicle position, live only. */
  lat?: number;
  lng?: number;
  /** Departure time (HH:MM) from the route origin, schedule only. */
  time?: string;
}

export interface NearbyStop {
  line: string;
  direction: "ida" | "volta";
  destination: string;
  /** Where the line ends on the other side, e.g. "SUZANO (BARUEL)" (the "ida" destination). */
  otherEnd: string;
  address: string;
  lat: number;
  lng: number;
  /** Google encoded polyline of the whole route, for the map. */
  path: string;
  distanceM: number;
  /** True at the route origin: the schedule is the departure from this very stop. */
  terminal: boolean;
  arrivals: Arrival[];
}
