import { db } from "core/db";
import { eq } from "drizzle-orm";
import { googleAccounts } from "extensions/db/google-accounts";
import { google } from "googleapis";
import safeEnvGet from "utils/safeEnvGet";

const GOOGLE_AUTH_SCOPES = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
];

const GOOGLE_OAUTH_CLIENT_ID = safeEnvGet("GCP_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET = safeEnvGet("GCP_OAUTH_CLIENT_SECRET");
const REDIRECT_PATHNAME = "/google-accounts/oauth/callback";

type AccountRow = typeof googleAccounts.$inferSelect;

function generateRedirectUri(serverURL: string) {
    const redirectUri = new URL(REDIRECT_PATHNAME, serverURL);
    redirectUri.protocol = redirectUri.hostname === "localhost" ? "http" : "https";
    return redirectUri.toString();
}

function createOAuth2Client(serverURL: string) {
    return new google.auth.OAuth2(
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET,
        generateRedirectUri(serverURL),
    );
}

export function getAuthUrl(serverURL: string) {
    const oauth2Client = createOAuth2Client(serverURL);
    return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: GOOGLE_AUTH_SCOPES,
        prompt: "consent",
    });
}

export async function processCode(code: string, serverURL: string) {
    const oauth2Client = createOAuth2Client(serverURL);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const userinfo = await google.oauth2("v2").userinfo.get({ auth: oauth2Client });
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
                ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
                accessToken: tokens.access_token,
                expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                idToken: tokens.id_token,
                tokenType: tokens.token_type,
            },
        });

    return email;
}

export async function listAccounts(): Promise<string[]> {
    const rows = await db.select({ email: googleAccounts.email }).from(googleAccounts);
    return rows.map((row) => row.email);
}

export async function deleteAccount(email: string): Promise<boolean> {
    const deleted = await db
        .delete(googleAccounts)
        .where(eq(googleAccounts.email, email))
        .returning();
    return deleted.length > 0;
}

function buildClientFromRow(row: AccountRow) {
    const oauth2Client = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET);
    oauth2Client.setCredentials({
        refresh_token: row.refreshToken,
        access_token: row.accessToken,
        expiry_date: row.expiryDate ? row.expiryDate.getTime() : undefined,
        id_token: row.idToken,
        token_type: row.tokenType,
    });

    oauth2Client.on("tokens", (tokens) => {
        void db
            .update(googleAccounts)
            .set({
                accessToken: tokens.access_token ?? row.accessToken,
                ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
                expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : row.expiryDate,
                idToken: tokens.id_token ?? row.idToken,
                tokenType: tokens.token_type ?? row.tokenType,
            })
            .where(eq(googleAccounts.email, row.email));
    });

    return { email: row.email, authClient: oauth2Client };
}

export async function getClient(email: string) {
    const [row] = await db
        .select()
        .from(googleAccounts)
        .where(eq(googleAccounts.email, email))
        .limit(1);
    if (!row) throw new Error(`Google account not found: ${email}`);
    return buildClientFromRow(row);
}

export async function getAllClients() {
    const rows = await db.select().from(googleAccounts);
    return rows.map(buildClientFromRow);
}
