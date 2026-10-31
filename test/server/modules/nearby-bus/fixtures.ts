import type { PortalLine, PortalVehicle } from "@server/modules/nearby-bus/model";

function encodeValue(v: number) {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = "";
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
}

export function encodePolyline(points: [number, number][]) {
  let lat = 0;
  let lng = 0;
  return points
    .map(([a, b]) => {
      const la = Math.round(a * 1e5);
      const ln = Math.round(b * 1e5);
      const s = encodeValue(la - lat) + encodeValue(ln - lng);
      lat = la;
      lng = ln;
      return s;
    })
    .join("");
}

const LNG = -46.3;
const stop = (lat: number, endereco: string) => ({ latitude: lat, longitude: LNG, endereco });
const southbound: [number, number][] = Array.from({ length: 41 }, (_, i) => [-23.6 - i * 0.001, LNG]);

export const vehicle = (over: Partial<PortalVehicle>, now: number): PortalVehicle => ({
  prefixo: "V",
  sentidoLinha: "volta",
  latitude: -23.61,
  longitude: LNG,
  dataUltimaTransmissao: now - 30_000,
  dentroRota: true,
  ...over,
});

/** "volta" runs south (Suzano -> Ribeirão); "ida" runs the opposite way. */
export function makeLine(now: number, over: Partial<PortalLine> = {}): PortalLine {
  return {
    codigo: "381",
    velocidadeMedia: 30,
    veiculos: [
      vehicle({ prefixo: "AHEAD", latitude: -23.61 }, now),
      vehicle({ prefixo: "FAR", latitude: -23.605 }, now),
      vehicle({ prefixo: "PASSED", latitude: -23.63 }, now),
      vehicle({ prefixo: "STALE", latitude: -23.612 , dataUltimaTransmissao: now - 10 * 60_000 }, now),
      vehicle({ prefixo: "OFF", latitude: -23.612, dentroRota: false }, now),
      vehicle({ prefixo: "OPPOSITE", sentidoLinha: "ida" }, now),
    ],
    rotas: [
      {
        sentido: "ida",
        destino: "SUZANO (BARUEL)",
        encode: encodePolyline([...southbound].reverse()),
        pontos: [stop(-23.64, "Terminal"), stop(-23.62, "Pena (lado oposto)"), stop(-23.6, "Fim ida")],
        horariosdiasuteis: "9:00,10:30,11:00,12:00,13:00",
        horariossabados: "10:15,10:45",
        horariosdomingosferiados: "10:20",
      },
      {
        sentido: "volta",
        destino: "RIBEIRAO PIRES",
        encode: encodePolyline(southbound),
        pontos: [stop(-23.6, "Origem volta"), stop(-23.62, "Pena"), stop(-23.64, "Terminal (chegada)")],
        horariosdiasuteis: "10:30,11:00,12:00,13:00",
        horariossabados: "10:15,10:45",
        horariosdomingosferiados: "10:20",
      },
    ],
    ...over,
  };
}
