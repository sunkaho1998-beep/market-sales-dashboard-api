
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from './config.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// RESPONSE PARSING
// ==========================================

export function parseResult(response) {
  if (
    response?.structuredContent &&
    typeof response.structuredContent === 'object'
  ) {
    return response.structuredContent;
  }

  for (const item of response?.content || []) {
    if (item.text) {
      try {
        return JSON.parse(item.text);
      } catch {
        continue;
      }
    }
  }

  return response;
}

// ==========================================
// BUSINESS ERROR VALIDATION
// ==========================================

function isBusinessFailure(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (
    payload.success === false ||
    Number(payload.code) === 102
  ) {
    return true;
  }

  // LingXing may return outer code=1
  // while inner data.code=0 indicates failure.
  if (
    payload.data &&
    typeof payload.data === 'object' &&
    Object.prototype.hasOwnProperty.call(
      payload.data,
      'code'
    ) &&
    Number(payload.data.code) === 0
  ) {
    return true;
  }

  return false;
}

// ==========================================
// MCP TOOL DISCOVERY
// ==========================================

function toolBySuffix(tools, suffix) {
  const matches = tools.filter(tool =>
    tool.name === suffix ||
    tool.name.endsWith(`__${suffix}`)
  );

  if (matches.length !== 1) {
    throw new Error(
      `MCP wrapper '${suffix}' expected once; found ${matches.length}`
    );
  }

  return matches[0];
}

function stale(error) {
  const message = String(
    error?.message || error
  ).toLowerCase();

  return (
    message.includes('工具参数定义已更新') ||
    message.includes('刷新工具列表') ||
    message.includes('code\\":102') ||
    message.includes('status: 422') ||
    message.includes('status 422')
  );
}

// ==========================================
// MCP CONNECTION
// ==========================================

async function newClient() {
  const client = new Client({
    name: 'keychron-sales-intelligence',
    version: '4.0.0'
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(config.mcpUrl),
    {
      requestInit: {
        headers: {
          'X-Mcp-Key': config.mcpKey
        }
      }
    }
  );

  await client.connect(transport);

  const tools = (
    await client.listTools()
  ).tools || [];

  return {
    client,
    tools
  };
}

// ==========================================
// MCP TOOL CALL
// ==========================================

async function call(client, tool, args) {
  const response = await client.callTool({
    name: tool.name,
    arguments: args
  });

  await wait(1050);

  const text = (response.content || [])
    .map(item => item.text || '')
    .join('\n');

  const payload = parseResult(response);

  if (response.isError) {
    throw new Error(
      `${tool.name}: ${text || JSON.stringify(response.content || [])}`
    );
  }

  if (isBusinessFailure(payload)) {
    throw new Error(
      `${tool.name}: LingXing business request failed: ` +
      `${JSON.stringify(payload)}`
    );
  }

  return response;
}

// ==========================================
// ONE MCP SESSION
// help -> search -> action
// ==========================================

async function oneSession(toolId, params) {
  const { client, tools } = await newClient();

  try {
    const help = toolBySuffix(tools, 'help');
    const search = toolBySuffix(tools, 'search');
    const action = toolBySuffix(tools, 'action');

    await call(client, help, {
      query: toolId,
      limit: 50,
      offset: 0
    });

    await call(client, search, {
      toolId
    });

    return await call(client, action, {
      toolId,
      params
    });

  } finally {
    await client.close().catch(() => {});
  }
}

// ==========================================
// BUSINESS TOOL EXECUTION
// ==========================================

export async function executeBusinessTool(
  toolId,
  params
) {
  try {
    return await oneSession(toolId, params);

  } catch (error) {
    if (!stale(error)) {
      throw error;
    }

    console.warn(
      `LingXing schema stale for ${toolId}; ` +
      'creating a new MCP session and rediscovering schema.'
    );

    await wait(1500);

    return await oneSession(toolId, params);
  }
}

// ==========================================
// MCP INSPECTION
// ==========================================

export async function inspectMcp() {
  const { client, tools } = await newClient();

  try {
    return tools
      .filter(tool =>
        ['help', 'search', 'action'].some(
          suffix =>
            tool.name === suffix ||
            tool.name.endsWith(`__${suffix}`)
        )
      )
      .map(tool => ({
        name: tool.name,
        description: tool.description || ''
      }));

  } finally {
    await client.close().catch(() => {});
  }
}

// ==========================================
// RESPONSE LIST EXTRACTION
// ==========================================

export function listOf(response) {
  const payload = parseResult(response);

  for (const value of [
    payload?.data?.list,
    payload?.data?.data,
    payload?.data?.data?.list,
    payload?.list,
    payload?.data
  ]) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

// ==========================================
// RESPONSE TOTAL EXTRACTION
// ==========================================

export function totalOf(response) {
  const payload = parseResult(response);

  return Number(
    payload?.data?.data?.total ??
    payload?.data?.total ??
    payload?.data?.count ??
    payload?.total ??
    0
  );
}
