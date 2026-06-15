import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createServer as createNodeServer } from "node:http";
import { relative, resolve } from "node:path";
import { createServer, getServerPort } from "@devvit/web/server";
import { api } from "./routes/api";
import { menu } from "./routes/menu";

const app = new Hono();
const internal = new Hono();
const staticDir = process.env.LOCAL_STATIC_DIR;
const staticRoot = staticDir ? relative(process.cwd(), resolve(staticDir)) || "." : "";

internal.route("/menu", menu);
app.route("/api", api);
app.route("/internal", internal);

if (staticDir) {
  app.use("/*", serveStatic({ root: staticRoot }));
  app.get("*", async (c, next) => {
    const path = c.req.path || "/";
    if (path !== "/" && /\.[a-z0-9]+$/i.test(path)) {
      await next();
      if (c.res.status === 404) {
        return c.text("Not Found", 404);
      }
      return;
    }
    return serveStatic({ root: staticRoot, path: "game.html" })(c, next);
  });
}

serve({
  fetch: app.fetch,
  createServer: staticDir ? createNodeServer : createServer,
  hostname: process.env.HOST,
  port: Number(process.env.PORT || getServerPort()),
});
