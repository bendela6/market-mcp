#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { environment } from './environment.js';
import { createApiClient } from './api-client.js';
import { registerMarketTools } from './tools.js';

function buildServer(): McpServer {
  const api = createApiClient();
  const server = new McpServer({ name: 'market-mcp', version: '0.1.0' });
  registerMarketTools(server, api);
  return server;
}

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = buildServer();
  await server.connect(transport);
  console.error(`[market-mcp] stdio ready — api=${environment.API_URL}`);
}

async function startHttp(port: number): Promise<void> {
  const certPath = environment.MCP_TLS_CERT;
  const keyPath = environment.MCP_TLS_KEY;
  const useTls = !!(certPath && keyPath);
  const scheme = useTls ? 'https' : 'http';
  const createServer = useTls
    ? (handler: http.RequestListener) =>
        https.createServer(
          { cert: fs.readFileSync(certPath!), key: fs.readFileSync(keyPath!) },
          handler,
        )
    : http.createServer;

  const httpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith('/mcp')) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found. POST/GET /mcp');
      return;
    }
    let body: unknown = undefined;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      if (chunks.length > 0) {
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
      }
    }
    const perReqServer = buildServer();
    const perReqTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      perReqTransport.close();
      perReqServer.close();
    });
    try {
      await perReqServer.connect(perReqTransport);
      await perReqTransport.handleRequest(req, res, body);
    } catch (err) {
      console.error('[market-mcp] request failed:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`[market-mcp] ${scheme} ready — ${scheme}://localhost:${port}/mcp  api=${environment.API_URL}`);
  });

  const shutdown = (): void => {
    console.error('[market-mcp] shutting down');
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  if (environment.MCP_HTTP === '1') {
    await startHttp(environment.MCP_PORT);
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error('[market-mcp] fatal:', err);
  process.exit(1);
});
