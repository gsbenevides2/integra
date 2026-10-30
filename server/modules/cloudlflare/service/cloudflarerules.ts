import { db } from "@server/db";
import { bypassToken } from "@server/db/cloudflare";
import safeEnvGet from "@server/safeEnvGet";

import Cloudflare from "cloudflare";
import { and, eq, gte } from "drizzle-orm";

export class CloudflareRules {
  static bypass_cookie = "cf_bypass_integra" as const;

  static async createToken() {
    const token = crypto.randomUUID();
    await db.insert(bypassToken).values({
      id: token,
      active: true,
    });
    await this.updateCf();
    return token;
  }

  static async inativateToken(token: string) {
    await db
      .update(bypassToken)
      .set({
        active: false,
      })
      .where(eq(bypassToken.id, token));
    await this.updateCf();
  }

  static async checkIfIsValid(token: string) {
    const validTokens = await this.getValidTokens();
    return validTokens.includes(token);
  }

  static async getValidTokens() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const validTokens = await db
      .select({ id: bypassToken.id })
      .from(bypassToken)
      .where(
        and(
          gte(bypassToken.createdAt, thirtyDaysAgo),
          eq(bypassToken.active, true),
        ),
      );

    return validTokens.map((a) => a.id);
  }

  static async updateCf() {
    const client = new Cloudflare({
      apiToken: safeEnvGet("CLOUDFLARE_API_TOKEN"),
    });

    const validTokens = await this.getValidTokens();
    if (validTokens.length === 0) {
      await client.rulesets.rules.edit(safeEnvGet("CLOUDFLARE_RULE_ID"), {
        ruleset_id: safeEnvGet("CLOUDFLARE_RULESET_ID"),
        zone_id: safeEnvGet("CLOUDFLARE_ZONE_ID"),
        action: "set_config",
        enabled: false,
      });
    } else if (validTokens.length === 1) {
      const token = validTokens.at(0) as string;
      await client.rulesets.rules.edit(safeEnvGet("CLOUDFLARE_RULE_ID"), {
        ruleset_id: safeEnvGet("CLOUDFLARE_RULESET_ID"),
        zone_id: safeEnvGet("CLOUDFLARE_ZONE_ID"),
        action: "set_config",
        expression: `(http.host contains "integra.infr.gui.dev.br" and http.cookie contains "${this.bypass_cookie}=${token}")`,
        description: "Disabled defense mode for integra-users",
        enabled: true,
        action_parameters: { security_level: "essentially_off" },
      });
    } else if (validTokens.length > 1) {
      const andString = validTokens
        .map(
          (token) => `(http.cookie contains "${this.bypass_cookie}=${token}")`,
        )
        .join(" or ");
      await client.rulesets.rules.edit(safeEnvGet("CLOUDFLARE_RULE_ID"), {
        ruleset_id: safeEnvGet("CLOUDFLARE_RULESET_ID"),
        zone_id: safeEnvGet("CLOUDFLARE_ZONE_ID"),
        action: "set_config",
        expression: `(http.host contains "integra.infr.gui.dev.br" and (${andString}))`,
        description: "Disabled defense mode for integra-users",
        enabled: true,
        action_parameters: { security_level: "essentially_off" },
      });
    }
  }
}
