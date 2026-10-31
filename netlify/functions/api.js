/**
 * Netlify Serverless Function: Soofi Mandi API Gateway
 *
 * Routes incoming /api/* and admin requests on Netlify to the existing server request handler.
 * Reuses server.js and db.js without code duplication or database migrations.
 * Works seamlessly with both Netlify Functions v1 (AWS Lambda) and v2 (Web API).
 */

process.env.NETLIFY = "true";
process.env.SERVERLESS = "1";

const { handleRequest, dbReadyPromise } = require("../../server");
const { Readable } = require("node:stream");

// Helper: Normalize incoming path and query string from Netlify event or Request
function resolveRequestPath(event) {
  let pathname = "";
  let search = "";

  // 1. If rawUrl is provided, parse directly
  if (event.rawUrl) {
    try {
      const u = new URL(event.rawUrl);
      pathname = u.pathname;
      search = u.search;
    } catch (_) {}
  }

  // 2. If pathname not resolved or contains .netlify/functions, extract from event.path
  if (!pathname || pathname.includes("/.netlify/functions/")) {
    let p = event.path || "";
    if (p.startsWith("/.netlify/functions/api")) {
      p = p.slice("/.netlify/functions/api".length);
    }
    if (!p || p === "/") {
      p = "/api";
    } else if (p.startsWith("/admin/game-analytics")) {
      // Preserve admin dashboard routes like /admin/game-analytics
      p = p.startsWith("/") ? p : "/" + p;
    } else if (!p.startsWith("/api")) {
      p = "/api" + (p.startsWith("/") ? p : "/" + p);
    }
    pathname = p;
  }

  // 3. Query string parameters
  if (!search && event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
    search = "?" + new URLSearchParams(event.queryStringParameters).toString();
  }

  return pathname + search;
}

// Netlify Functions Handler (AWS Lambda format - 100% universal across all Netlify versions)
const handler = async function (event, context) {
  await dbReadyPromise;

  return new Promise((resolve) => {
    const method = (event.httpMethod || "GET").toUpperCase();
    const reqUrl = resolveRequestPath(event);

    // Normalize headers to lowercase
    const headers = {};
    if (event.headers) {
      for (const [k, v] of Object.entries(event.headers)) {
        headers[k.toLowerCase()] = v;
      }
    }

    // Decode request body if present
    let rawBody = event.body || "";
    if (event.isBase64Encoded && rawBody) {
      try {
        rawBody = Buffer.from(rawBody, "base64").toString("utf8");
      } catch (_) {}
    }

    // Create a mock stream for IncomingMessage
    const reqStream = new Readable({
      read() {
        if (rawBody) {
          this.push(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8"));
        }
        this.push(null);
      }
    });

    reqStream.url = reqUrl;
    reqStream.method = method;
    reqStream.headers = headers;
    reqStream.rawHeaders = Object.entries(headers).flat();
    reqStream.body = rawBody; // Pre-populated for parseJsonBody

    let resStatusCode = 200;
    const resHeaders = {};
    const responseChunks = [];

    const mockRes = {
      statusCode: 200,
      writeHead(code, reasonOrHeaders, maybeHeaders) {
        resStatusCode = code;
        this.statusCode = code;
        const hdrs = (typeof reasonOrHeaders === "object") ? reasonOrHeaders : maybeHeaders;
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) {
            resHeaders[k] = v;
          }
        }
        return this;
      },
      setHeader(key, val) {
        resHeaders[key] = val;
        return this;
      },
      getHeader(key) {
        return resHeaders[key];
      },
      removeHeader(key) {
        delete resHeaders[key];
      },
      write(chunk) {
        if (chunk) {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return true;
      },
      end(chunk) {
        if (chunk) {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const bodyBuf = Buffer.concat(responseChunks);
        resolve({
          statusCode: resStatusCode,
          headers: resHeaders,
          body: bodyBuf.toString("utf8")
        });
      }
    };

    try {
      const handlePromise = handleRequest(reqStream, mockRes);
      if (handlePromise && typeof handlePromise.catch === "function") {
        handlePromise.catch((err) => {
          console.error("Netlify handler error:", err);
          resolve({
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, message: "Internal server error" })
          });
        });
      }
    } catch (err) {
      console.error("Netlify handler invocation error:", err);
      resolve({
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, message: "Internal server error" })
      });
    }
  });
};

// Also support Netlify Functions v2 (Standard Web API Request -> Response)
const defaultExport = async function (req, context) {
  if (!req || typeof req.text !== "function") {
    // If called with (event, context) instead
    return handler(req, context);
  }

  const url = new URL(req.url);
  const method = req.method;
  const headers = {};
  if (req.headers && typeof req.headers.forEach === "function") {
    req.headers.forEach((v, k) => { headers[k] = v; });
  }

  let body = "";
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await req.text();
    } catch (_) {}
  }

  const result = await handler({
    httpMethod: method,
    rawUrl: req.url,
    path: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    headers,
    body
  }, context);

  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers
  });
};

module.exports = handler;
module.exports.handler = handler;
module.exports.default = defaultExport;
