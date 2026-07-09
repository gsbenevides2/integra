import * as jose from "jose";
import safeEnvGet from "utils/safeEnvGet";
import { addTracerEvent, instrumentableFetch } from "instrumentation";
import { CacheClient } from "utils/cacheClient";

interface ServiceAccount {
    client_id: string;
}
const username = safeEnvGet("AUTHENTIK_USERNAME");
const password = safeEnvGet("AUTHENTIK_PASSWORD");

async function getAndValidFromCache(clientId: string): Promise<string | null> {
    function getExpirationFromJWT(token: string): number | null {
        try {
            const decoded = jose.decodeJwt(token);
            if (decoded && typeof decoded.exp === "number") {
                return decoded.exp;
            }
            return null;
        } catch (error) {
            console.error("Error decoding JWT:", error);
            return null;
        }
    }

    function isJWTExpired(token: string, bufferSeconds: number = 0): boolean {
        const exp = getExpirationFromJWT(token);
        if (exp === null) {
            return true; // Treat as expired if we can't decode
        }
        const currentTime = Math.floor(Date.now() / 1000);
        return exp < currentTime + bufferSeconds;
    }

    const value = await CacheClient.get(`authentik-login:${clientId}`);
    if (!value) return null;
    if (isJWTExpired(value)) return null;
    return value;
}

async function setCache(clientId: string, token: string) {
    await CacheClient.set(`authentik-login:${clientId}`, token);
}

export async function loginInAuthentik(serviceAccount: ServiceAccount, traceId: string) {
    const cacheToken = await getAndValidFromCache(serviceAccount.client_id);
    await addTracerEvent({
        eventData: { cacheToken, serviceAccount },
        eventName: "Authentik CacheToken",
        eventType: "INFO",
        traceId,
    });
    if (cacheToken)
        return {
            access_token: cacheToken,
        };
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    const urlencoded = new URLSearchParams();
    urlencoded.append("client_id", serviceAccount.client_id);
    urlencoded.append("grant_type", "client_credentials");
    urlencoded.append("scope", "profile");
    const base64 = btoa(`${username}:${password}`);
    urlencoded.append("client_secret", base64);

    const tokenUrl = new URL("/application/o/token/", authentikBaseUrl).toString();
    const response = await instrumentableFetch(traceId, tokenUrl, {
        method: "POST",
        headers: myHeaders,
        body: urlencoded,
        redirect: "follow",
    });
    if (!response.ok) throw new Error(`Failed to get token: ${response.statusText}`);
    const json = (await response.json()) as { access_token: string };
    await setCache(serviceAccount.client_id, json.access_token);
    return json;
}
