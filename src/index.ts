import http from "http";
import path from "path";
import httpProxy from "http-proxy";
import express from "express";
import fs from "fs";

const port = parseInt(process.env.PORT || "80");
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
    cookieDomainRewrite: "",
    cookiePathRewrite: false,
    protocolRewrite: "http",
    selfHandleResponse: true,
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
    proxy.on("proxyRes", (pres) => {
        const body: Uint8Array[] = [];
        pres.on('data', function (chunk: Uint8Array) {
            body.push(chunk);
        });
        pres.on('end', function () {
            res.type(pres.headers["content-type"] || "text/plain");
            res.status(pres.statusCode || 200);
            if(pres.headers["set-cookie"]) {
                if(Array.isArray(pres.headers["set-cookie"])) {
                    pres.headers["set-cookie"].forEach((c) => {
                        res.append("Set-Cookie", c);
                    });
                } else {
                    const cookie_ = pres.headers["set-cookie"];
                    const cookie = (cookie_ as string).split(";");
                    const cookie_name = cookie[0].split("=")[0];
                    const cookie_value = cookie[0].split("=")[1];
                    res.cookie(cookie_name, cookie_value);
                }
            }
            const reqbody = Buffer.concat(body).toString();
            res.end(reqbody);
        });
    });
    proxy.web(req, res);
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
