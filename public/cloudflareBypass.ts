/**
 * Makes sure the Cloudflare bot-fight bypass is on for this browser: asks the server and,
 * when it is off, toggles it on. Best effort: any failure is ignored.
 */
export async function ensureCloudflareBypass(): Promise<void> {
  try {
    const check = await fetch("/api/cloudflare/check-bypass");
    if (!check.ok) return;
    const { status } = (await check.json()) as { status: boolean };
    if (!status) await fetch("/api/cloudflare/toogle-bypass", { method: "POST" });
  } catch {
    // The bypass is an optimisation, never worth interrupting the app.
  }
}
