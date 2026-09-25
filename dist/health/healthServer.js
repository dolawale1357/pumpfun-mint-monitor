import { createServer, } from "node:http";
import { logger } from "../utils/logger.js";
import { evaluateHealth, } from "./healthChecker.js";
const HEALTH_PATHS = new Set(["/health", "/healthz"]);
/**
 * Minimal HTTP endpoint used to answer "is the bot actually working?".
 *
 * Deliberately built on `node:http` rather than Express: this is one route,
 * and a framework would add dependencies to an install that has to survive on
 * a 256 MB container and a cold-starting free instance.
 *
 * It exposes no secrets. The bot token and chat id are never referenced here.
 */
export class HealthServer {
    options;
    server = null;
    constructor(options) {
        this.options = options;
    }
    isListening() {
        return this.server !== null && this.server.listening;
    }
    async start() {
        if (this.server !== null) {
            return;
        }
        const host = this.options.host ?? "0.0.0.0";
        const server = createServer((request, response) => {
            this.handleRequest(request, response);
        });
        server.on("clientError", (_error, socket) => {
            socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        });
        await new Promise((resolve, reject) => {
            const onListening = () => {
                server.off("error", onError);
                resolve();
            };
            const onError = (error) => {
                server.off("listening", onListening);
                reject(error);
            };
            server.once("listening", onListening);
            server.once("error", onError);
            server.listen(this.options.port, host);
        });
        this.server = server;
        logger.health(`Health endpoint listening on http://${host}:${this.options.port}/health`);
    }
    async stop() {
        const server = this.server;
        if (server === null) {
            return;
        }
        this.server = null;
        await new Promise((resolve) => {
            server.close(() => resolve());
            // Idle keep-alive sockets would otherwise hold close() open.
            server.closeAllConnections();
        });
        logger.health("Health endpoint stopped");
    }
    buildReport() {
        const now = this.options.now?.() ?? Date.now();
        return evaluateHealth(this.options.readSnapshot(), this.options.thresholds, now);
    }
    handleRequest(request, response) {
        const method = request.method ?? "GET";
        const headOnly = method === "HEAD";
        if (method !== "GET" && !headOnly) {
            response.setHeader("allow", "GET, HEAD");
            this.sendJson(response, 405, { error: "method not allowed", allow: ["GET", "HEAD"] }, false);
            return;
        }
        const rawUrl = request.url ?? "/";
        const path = rawUrl.split("?")[0] ?? "/";
        const report = this.buildReport();
        if (HEALTH_PATHS.has(path)) {
            this.sendJson(response, report.healthy ? 200 : 503, report, headOnly);
            return;
        }
        if (path === "/") {
            const summary = report.healthy
                ? `${report.status}: monitor healthy\n`
                : `${report.status}: ${report.reasons.join("; ")}\n`;
            this.sendText(response, report.healthy ? 200 : 503, summary, headOnly);
            return;
        }
        this.sendJson(response, 404, { error: "not found", paths: ["/", "/health"] }, headOnly);
    }
    sendJson(response, statusCode, payload, headOnly) {
        const body = `${JSON.stringify(payload, null, 2)}\n`;
        response.statusCode = statusCode;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader("content-length", Buffer.byteLength(body));
        response.end(headOnly ? undefined : body);
    }
    sendText(response, statusCode, body, headOnly) {
        response.statusCode = statusCode;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader("content-length", Buffer.byteLength(body));
        response.end(headOnly ? undefined : body);
    }
}
//# sourceMappingURL=healthServer.js.map