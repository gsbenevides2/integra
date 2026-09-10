import { instrumentableFetch } from "core/instrumentation";
import { Window } from "happy-dom";
import { TRAIN_LINES } from "../constants";
import { getTrainLineStatus } from "../statusClassifier";
import type { ProcessedTrainLine } from "../types";
import type { MetroLine } from "./types";

const METRO_URL = "https://www.metro.sp.gov.br/wp-content/themes/metrosp/direto-metro.php";

async function fetchMetroLines(traceId: string): Promise<MetroLine[]> {
    const response = await instrumentableFetch(traceId, METRO_URL);
    const html = await response.text();

    const window = new Window();
    try {
        const document = window.document;
        document.write(html);

        const lines = document.querySelectorAll(".direto-metro .linha");

        return Array.from(lines).map((line) => {
            const numberBlock = line.querySelector(".linha-numero") as unknown as HTMLDivElement;
            const info = line.querySelector(".linha-info");
            const bsTitle = info?.getAttribute("data-bs-title") ?? "";

            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = bsTitle;

            const company = tempDiv.querySelector(".title")?.textContent ?? "";
            const description = tempDiv.querySelector(".description")?.textContent ?? "";
            const date = tempDiv.querySelector(".date")?.textContent ?? "";

            const color = numberBlock.style.backgroundColor;
            const statusBubble = line.querySelector(
                ".linha-situacao-icon",
            ) as unknown as HTMLDivElement;
            const statusColor = statusBubble.style.backgroundColor;

            return {
                number: numberBlock.textContent ?? "",
                name: line.querySelector(".linha-nome")?.textContent ?? "",
                status: line.querySelector(".linha-situacao")?.textContent ?? "",
                company,
                description,
                date,
                color,
                statusColor,
            } satisfies MetroLine;
        });
    } finally {
        await window.happyDOM.close();
    }
}

export async function processMetroLines(traceId: string): Promise<ProcessedTrainLine[]> {
    const metroLines = TRAIN_LINES.filter((line) => line.company === "metro");
    const data = await fetchMetroLines(traceId);

    return metroLines.map((line) => {
        const match = data.find((item) => item.number === line.code.toString());
        return {
            codigo: line.code,
            cor: line.color,
            situacao: match?.status ?? "",
            status: getTrainLineStatus(match?.status ?? ""),
            descricao: match?.description ?? "",
        };
    });
}
