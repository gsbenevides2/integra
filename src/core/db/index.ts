import { drizzle } from "drizzle-orm/bun-sql/postgres";

export const db = drizzle(process.env.DATABASE_URL!);
