import { db } from "@server/db";
import { googleAccounts } from "@server/db/schema";
import safeEnvGet from "@server/safeEnvGet";

import { eq } from "drizzle-orm";
import { google } from "googleapis";

const GOOGLE_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const REDIRECT_PATHNAME = "/api/google/oauth/callback";

type AccountRow = typeof googleAccounts.$inferSelect;

export interface GoogleAccountClient {
  email: string;
  authClient: InstanceType<typeof google.auth.OAuth2>;
}

function redirectUri(serverURL: string): string {
  const uri = new URL(REDIRECT_PATHNAME, serverURL);
  uri.protocol = uri.hostname === "localhost" ? "http" : "https";
  return uri.toString();
}

function oauthCredentials() {
  return {
    clientId: safeEnvGet("GCP_OAUTH_CLIENT_ID"),
    clientSecret: safeEnvGet("GCP_OAUTH_CLIENT_SECRET"),
  };
}

function clientFromRow(row: AccountRow): GoogleAccountClient {
  const authClient = new google.auth.OAuth2({ ...oauthCredentials() });
  authClient.setCredentials({
    refresh_token: row.refreshToken,
    access_token: row.accessToken,
    expiry_date: row.expiryDate ? row.expiryDate.getTime() : undefined,
    id_token: row.idToken,
    token_type: row.tokenType,
  });

  // Google rotates the access token (and sometimes the refresh token) behind the
  // scenes; persisting it here is what keeps a linked account usable after a restart.
  authClient.on("tokens", (tokens) => {
    void db
      .update(googleAccounts)
      .set({
        accessToken: tokens.access_token ?? row.accessToken,
        ...(tokens.refresh_token
          ? { refreshToken: tokens.refresh_token }
          : {}),
        expiryDate: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : row.expiryDate,
        idToken: tokens.id_token ?? row.idToken,
        tokenType: tokens.token_type ?? row.tokenType,
      })
      .where(eq(googleAccounts.email, row.email));
  });

  return { email: row.email, authClient };
}

export abstract class GoogleAccountService {
  static getAuthUrl(serverURL: string): string {
    const oauth2Client = new google.auth.OAuth2({
      ...oauthCredentials(),
      redirectUri: redirectUri(serverURL),
    });
    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_AUTH_SCOPES,
      prompt: "consent",
    });
  }

  static async processCode(code: string, serverURL: string): Promise<string> {
    const oauth2Client = new google.auth.OAuth2({
      ...oauthCredentials(),
      redirectUri: redirectUri(serverURL),
    });
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const userinfo = await google
      .oauth2("v2")
      .userinfo.get({ auth: oauth2Client });
    const email = userinfo.data.email;
    if (!email) throw new Error("Email not found in Google userinfo response");

    await db
      .insert(googleAccounts)
      .values({
        email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        idToken: tokens.id_token,
        tokenType: tokens.token_type,
      })
      .onConflictDoUpdate({
        target: googleAccounts.email,
        set: {
          ...(tokens.refresh_token
            ? { refreshToken: tokens.refresh_token }
            : {}),
          accessToken: tokens.access_token,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          idToken: tokens.id_token,
          tokenType: tokens.token_type,
        },
      });

    return email;
  }

  static async listAccounts(): Promise<string[]> {
    const rows = await db
      .select({ email: googleAccounts.email })
      .from(googleAccounts);
    return rows.map((row) => row.email);
  }

  static async deleteAccount(email: string): Promise<boolean> {
    const deleted = await db
      .delete(googleAccounts)
      .where(eq(googleAccounts.email, email))
      .returning();
    return deleted.length > 0;
  }

  static async getClient(email: string): Promise<GoogleAccountClient> {
    const [row] = await db
      .select()
      .from(googleAccounts)
      .where(eq(googleAccounts.email, email))
      .limit(1);
    if (!row) throw new Error(`Google account not found: ${email}`);
    return clientFromRow(row);
  }

  static async getAllClients(): Promise<GoogleAccountClient[]> {
    const rows = await db.select().from(googleAccounts);
    return rows.map(clientFromRow);
  }
}
