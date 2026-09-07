import { Elysia, status, StatusMap } from "elysia";
import { getAssetsPath } from "./utils";
import assetsAllowedPaths from "assetsAllowedPaths.json";
import redirects from "redirects.json";
import { renderToReadableStream } from "react-dom/server";
import { App } from "./App";

const ASSETS_PATH = getAssetsPath();

export const uiFactory = () =>
    new Elysia()
        .onRequest((a) => {
            const url = new URL(a.request.url);
            const path = url.pathname;
            const found = redirects.find((r) => r.from === path);
            if (found) {
                const headers = new Headers();
                headers.set("Location", found.to);
                return new Response(undefined, {
                    headers: headers,
                    status: found.status,
                });
            }
        })
        .get("/assets/:path", ({ params: { path } }) => {
            if (!assetsAllowedPaths.includes(path)) {
                return status(StatusMap["Not Found"]);
            }
            return Bun.file(`${ASSETS_PATH}/${path}`);
        })
        .get("/", async () => {
            const headers = new Headers();
            headers.set("content-type", "text/html");
            return new Response(
                await renderToReadableStream(<App />, {
                    bootstrapScripts: ["bundle.js"],
                }),
                {
                    headers,
                },
            );
        })
        .get("/bundle.js", async () => {
            const output = await Bun.build({
                entrypoints: ["/Users/gsbenevides2/personal/integra/src/core/ui/client-bundle.tsx"],

                minify: true,
                sourcemap: "inline",
            });
            const js = output.outputs[0];

            return () => {
                return new Response(js, {
                    headers: {
                        "Content-Type": "application/javascript",
                    },
                });
            };
        });
