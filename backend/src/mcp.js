import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from './config.js';

export async function withLingxingClient(fn) {
  const client = new Client({ name: 'keychron-partner-dashboard', version: '3.2.0' });
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
  let tools = (await client.listTools()).tools || [];
  let helpTool = findTool(tools, 'help');
  let searchTool = findTool(tools, 'search');
  let actionTool = findTool(tools, 'action');
  const schemaCache = new Map();

  const pause = () => new Promise(resolve => setTimeout(resolve, 1100));
  function errorText(error) {
    const parts = [error?.message, error?.stack];
    if (error?.content) parts.push(JSON.stringify(error.content));
    if (error?.cause) parts.push(JSON.stringify(error.cause));
    return parts.filter(Boolean).join(' ');
  }
  function isSchemaStale(error) {
    const text = errorText(error).toLowerCase();
    return text.includes('工具参数定义已更新') ||
      text.includes('刷新工具列表') ||
      text.includes('schema has changed') ||
      text.includes('tool schema') && text.includes('updated') ||
      text.includes('status: 422') || text.includes('status 422');
  }
  async function refreshWrappers() {
    // LingXing can invalidate cached tool definitions while the MCP connection remains open.
    // Refresh the advertised wrapper list before rediscovering the business tool schema.
    tools = (await client.listTools()).tools || [];
    helpTool = findTool(tools, 'help');
    searchTool = findTool(tools, 'search');
    actionTool = findTool(tools, 'action');
    schemaCache.clear();
  }
  async function callWrapper(tool, args) {
    const result = await client.callTool({ name: tool.name, arguments: args });
    await pause(); // respect LingXing QPS=1
    if (result.isError) throw new Error(`${tool.name} failed: ${JSON.stringify(result.content || [])}`);
    const payload = parsePayload(result);
    if (payload?.success === false || payload?.code === 102) {
      throw new Error(`${tool.name} failed: ${JSON.stringify(payload)}`);
    }
    return result;
  }
  async function discover(toolId, force = false) {
    if (!force && schemaCache.has(toolId)) return schemaCache.get(toolId);
    // Always rediscover the business tool through help -> search; forced refresh bypasses cache.
    await callWrapper(helpTool, { query: toolId, limit: 50, offset: 0 });
    const result = await callWrapper(searchTool, { toolId });
    const payload = parsePayload(result);
    schemaCache.set(toolId, payload);
    return payload;
  }
  async function execute(toolId, params) {
    await discover(toolId);
    try {
      return await callWrapper(actionTool, { toolId, params });
    } catch (error) {
      if (!isSchemaStale(error)) throw error;
      // Error 422/code 102 from LingXing explicitly instructs clients to refresh tool list.
      await refreshWrappers();
      await discover(toolId, true);
      return callWrapper(actionTool, { toolId, params });
    }
  }
  async function catalogue(query) {
    return callWrapper(helpTool, { query, limit: 50, offset: 0 });
  }
  return { get tools() { return tools; }, catalogue, discover, execute, refreshWrappers };
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
