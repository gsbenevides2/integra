import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:3000" });
process.env.REDIS_URL ??= "redis://localhost:6379";
