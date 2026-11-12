import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from './config.js';

export async function withLingxingClient(fn) {
  const client = new Client({ name: 'keychron-partner-dashboard', version: '2.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    requestInit: { headers: { 'X-Mcp-Key': config.mcpKey } }
  });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

function findTool(tools, suffix) {
  const matches = tools.filter(t => t.name === suffix || t.name.endsWith(`__${suffix}`));
  if (matches.length !== 1) throw new Error(`Expected one MCP wrapper tool '${suffix}', found ${matches.length}`);
  return matches[0];
}

export async function createLingxingGateway(client) {
  const tools = (await client.listTools()).tools || [];
  const helpTool = findTool(tools, 'help');
  const searchTool = findTool(tools, 'search');
  const actionTool = findTool(tools, 'action');
  const schemaCache = new Map();

  async function callWrapper(tool, args) {
    const result = await client.callTool({ name: tool.name, arguments: args });
    if (result.isError) throw new Error(`${tool.name} failed: ${JSON.stringify(result.content || [])}`);
    await new Promise(resolve => setTimeout(resolve, 1100)); // respect LingXing QPS=1
    return result;
  }

  async function discover(toolId) {
    if (schemaCache.has(toolId)) return schemaCache.get(toolId);
    // Follow the actual three-layer gateway: help discovers, search retrieves schema, action executes.
    await callWrapper(helpTool, { query: toolId, limit: 50, offset: 0 });
    const result = await callWrapper(searchTool, { toolId });
    const payload = parsePayload(result);
    schemaCache.set(toolId, payload);
    return payload;
  }

  async function execute(toolId, params) {
    await discover(toolId);
    return callWrapper(actionTool, { toolId, params });
  }

  async function catalogue(query) {
    return callWrapper(helpTool, { query, limit: 50, offset: 0 });
  }

  return { tools, catalogue, discover, execute };
}

export function parsePayload(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  for (const block of result?.content || []) {
    if (block?.text) {
      try { return JSON.parse(block.text); } catch { /* ignore non-JSON text blocks */ }
    }
  }
  return result;
}

export function extractList(result) {
  const root = parsePayload(result);
  const candidates = [
    root?.data?.list,
    root?.data?.data,
    root?.data?.data?.list,
    root?.list,
    root?.data
  ];
  for (const value of candidates) if (Array.isArray(value)) return value;
  return [];
}

export function extractTotal(result) {
  const root = parsePayload(result);
  return Number(root?.data?.total ?? root?.data?.count ?? root?.total ?? 0);
}


// Admin-only diagnostics: expose only the three gateway wrapper names and descriptions.
// Business data and authentication material are never included.
export async function listLingxingTools() {
  return withLingxingClient(async client => {
    const tools = (await client.listTools()).tools || [];
    return tools
      .filter(tool => ['help', 'search', 'action'].some(suffix =>
        tool.name === suffix || tool.name.endsWith(`__${suffix}`)
      ))
      .map(tool => ({ name: tool.name, description: tool.description || '' }));
  });
}
