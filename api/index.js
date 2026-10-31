/**
 * Vercel Serverless Function: API Gateway
 *
 * Routes incoming /api/* requests on Vercel to the existing server request handler.
 * Reuses server.js and db.js without code duplication or database migrations.
 */

process.env.VERCEL = "1";
process.env.SERVERLESS = "1";

const { handleRequest, dbReadyPromise } = require("../server");

module.exports = async (req, res) => {
  try {
    await dbReadyPromise;
    return await handleRequest(req, res);
  } catch (err) {
    console.error("Vercel API Gateway Error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, message: "Internal server error" }));
    }
  }
};

