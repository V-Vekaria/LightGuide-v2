// Local-only preview of the exported web app. Never serve the repository root.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist-web");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".json": "application/json",
};
createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) return res.writeHead(405).end();
  let path;
  try {
    path = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
  } catch {
    return res.writeHead(400).end();
  }
  if (path !== root && !path.startsWith(root + sep))
    return res.writeHead(403).end();
  try {
    if (!statSync(path).isFile()) path = resolve(root, "index.html");
  } catch {
    if (extname(path)) return res.writeHead(404).end();
    path = resolve(root, "index.html");
  }
  res.setHeader(
    "Content-Type",
    types[extname(path)] || "application/octet-stream",
  );
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(path);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}).listen(port, "0.0.0.0", () =>
  console.log(`LightGuide preview: http://127.0.0.1:${port}`),
);

