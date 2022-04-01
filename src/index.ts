import http from "http";
import path from "path";
import httpProxy from "http-proxy";
import express from "express";

const port = process.env.PORT || 80;
const upstreamProtocol = process.env.UPSTREAM_PROTOCOL || "http";
const upstreamHost = process.env.UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = process.env.UPSTREAM_PORT;
const upstream = `${upstreamProtocol}://${upstreamHost}${
    upstreamPort ? ":" + upstreamPort : ""
}`;

const app = express();
const proxy = httpProxy.createProxyServer({
    target: upstream,
    ws: true,
    secure: false,
    changeOrigin: true,
    xfwd: true,
    autoRewrite: true,
    preserveHeaderKeyCase: true,
    cookieDomainRewrite: false,
    cookiePathRewrite: false,
    protocolRewrite: "http",
    selfHandleResponse: false,
});
const server = http.createServer(app);

app.all("/*", (req, res) => {
    console.log(
        `[PROXY] Request: ${req.method} ${
            req.path
        } HTTP/1.1\n        User-Agent: ${
            req.headers["user-agent"] || "unknown"
        }`
    );
    if (req.path == "/pterodactyl-error.css")
        return res
            .status(200)
            .sendFile(
                path.join(__dirname, "..", "public", "pterodactyl-error.css")
            );
    console.log(`[PROXY] Proxying to upstream at: ${upstream}${req.path}`);
    proxy.web(req, res, {}, (err: Error, requ: http.IncomingMessage) => {
        if (err.message.includes("ECONNREFUSED") || requ.statusCode == 503) {
            res.status(503);
            res.sendFile(path.join(__dirname, "..", "public", "503.html"));
        } else {
            res.status(500);
            res.sendFile(path.join(__dirname, "..", "public", "500.html"));
        }
    });
});

server.on("upgrade", (req, socket, head) => {
    console.log(
        `[PROXY] Request: UPGRADE ${req.url}\n        User-Agent: ${
            req.headers["user-agent"] || "unknown"
        }`
    );
    proxy.ws(
        req,
        socket,
        head,
        {},
        (err: Error, requ: http.IncomingMessage) => {
            if (
                err.message.includes("ECONNREFUSED") ||
                requ.statusCode == 503
            ) {
                socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
                socket.end();
            } else {
                socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
                socket.end();
            }
        }
    );
});

server.listen(port, () => {
    console.log(`[PROXY] Listening on port ${port}.`);
    console.log(`[PROXY] Proxying to ${upstream}.`);
});
