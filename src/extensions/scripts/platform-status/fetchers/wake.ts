import { instrumentableFetch } from "core/instrumentation";
import type { StatusFetcher } from "./types";

const TENANT_HEADER = "X-Public-Tenant-Id";

interface WakeTenant {
    id: string;
    display_name: string;
}

interface WakeComponent {
    id: string;
    name: string;
    status: string;
    hidden_from_public?: boolean;
}

interface WakeIncident {
    title?: string;
    status?: string;
    affected_component_ids?: string[];
}

interface WakeSummaryResponse {
    overall_status: string;
    components?: WakeComponent[];
    open_incidents?: WakeIncident[];
    tenant_id?: string;
    tenant_display_name?: string;
}

/**
 * Statuses that are not considered an outage. A scheduled maintenance window is
 * announced in advance, so it is reported as healthy - the same way the Instatus
 * fetcher treats UNDERMAINTENANCE.
 */
const HEALTHY_STATUSES = ["operational", "under_maintenance"];

function isHealthy(status: string | undefined): boolean {
    return HEALTHY_STATUSES.includes((status ?? "").toLowerCase());
}

/**
 * Reads the tenant (product) id from the configured URL, when the status page
 * serves more than one product and only one of them should be monitored.
 * Example: https://status.wake.tech/?tenant=51fe4c6b-393f-49f1-a83e-7a84c5325125
 */
function getTenantFromUrl(url: URL): string | null {
    const tenant = url.searchParams.get("tenant");
    return tenant?.trim() ? tenant.trim() : null;
}

async function fetchTenants(baseUrl: string, traceId: string): Promise<Array<WakeTenant | null>> {
    try {
        const response = await instrumentableFetch(traceId, `${baseUrl}/api/public/tenants`);
        console.log(response);
        const tenants = (await response.json()) as WakeTenant[];
        return Array.isArray(tenants) && tenants.length > 0 ? tenants : [null];
    } catch {
        // Single tenant deployments do not expose the endpoint.
        return [null];
    }
}

async function fetchSummary(
    baseUrl: string,
    tenantId: string | null,
    traceId: string,
): Promise<WakeSummaryResponse> {
    const response = await instrumentableFetch(traceId, `${baseUrl}/api/public/summary`, {
        headers: tenantId ? { [TENANT_HEADER]: tenantId } : undefined,
    });
    return (await response.json()) as WakeSummaryResponse;
}

/**
 * Builds a human readable description of what is wrong with a product, using the
 * open incidents when available and falling back to the affected components.
 */
function describeProblem(summary: WakeSummaryResponse): string {
    const components = summary.components ?? [];
    const componentNames = new Map(components.map((c) => [c.id, c.name]));

    const incidents = (summary.open_incidents ?? []).map((incident) => {
        const title = incident.title?.trim() || "Untitled incident";
        const affected = (incident.affected_component_ids ?? [])
            .map((id) => componentNames.get(id))
            .filter(Boolean);

        const details = [incident.status, affected.join(", ")].filter(Boolean).join(" - ");

        return details ? `${title} (${details})` : title;
    });

    if (incidents.length > 0) return incidents.join("; ");

    const affectedComponents = components
        .filter((component) => !isHealthy(component.status))
        .map((component) => `${component.name}: ${component.status}`);

    if (affectedComponents.length > 0) return affectedComponents.join("; ");

    return `Overall status: ${summary.overall_status}`;
}

/**
 * Fetches the status of a status page built with the statuspage-manager service
 * (self hosted, used by Wake). The page exposes a public JSON API and may serve
 * several products (tenants) from the same host, selected through the
 * X-Public-Tenant-Id header - when no tenant is pinned in the URL, every
 * product is checked.
 */
export const fetchFromWakeStatuspage: StatusFetcher = async (endpoint, traceId) => {
    const endpointUrl = new URL(endpoint);
    const baseUrl = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const pinnedTenant = getTenantFromUrl(endpointUrl);

    const tenants = pinnedTenant
        ? [{ id: pinnedTenant, display_name: pinnedTenant }]
        : await fetchTenants(baseUrl, traceId);

    const summaries = await Promise.all(
        tenants.map(async (tenant) => {
            const summary = await fetchSummary(baseUrl, tenant?.id ?? null, traceId);
            return { tenant, summary };
        }),
    );

    const problems = summaries
        .filter(({ summary }) => !isHealthy(summary.overall_status))
        .map(({ tenant, summary }) => {
            const name = summary.tenant_display_name ?? tenant?.display_name;
            const description = describeProblem(summary);
            return name ? `${name}: ${description}` : description;
        });

    if (problems.length > 0) {
        return { status: "DOWN", problemDescription: problems.join(" | ") };
    }

    return { status: "OK" };
};
