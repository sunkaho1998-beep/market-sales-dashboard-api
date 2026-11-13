import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {config} from './config.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function parseResult(r){if(r?.structuredContent&&typeof r.structuredContent==='object')return r.structuredContent;for(const c of r?.content||[]){if(c.text){try{return JSON.parse(c.text)}catch{}}}return r;}
function toolBySuffix(tools,s){const a=tools.filter(t=>t.name===s||t.name.endsWith(`__${s}`));if(a.length!==1)throw new Error(`MCP wrapper '${s}' expected once; found ${a.length}`);return a[0];}
function stale(e){const t=String(e?.message||e).toLowerCase();return t.includes('工具参数定义已更新')||t.includes('刷新工具列表')||t.includes('code\\":102')||t.includes('status: 422')||t.includes('status 422');}
async function newClient(){const c=new Client({name:'keychron-sales-intelligence',version:'4.0.0'});const t=new StreamableHTTPClientTransport(new URL(config.mcpUrl),{requestInit:{headers:{'X-Mcp-Key':config.mcpKey}}});await c.connect(t);const tools=(await c.listTools()).tools||[];return {c,tools,transport:t};}
async function call(c,t,args){const r=await c.callTool({name:t.name,arguments:args});await wait(1050);const text=(r.content||[]).map(x=>x.text||'').join('\n');let p=parseResult(r);if(r.isError)throw new Error(`${t.name}: ${text||JSON.stringify(r.content||[])}`);if(p?.success===false||Number(p?.code)===102)throw new Error(`${t.name}: ${JSON.stringify(p)}`);return r;}
async function oneSession(toolId,params){const {c,tools}=await newClient();try{const help=toolBySuffix(tools,'help'),search=toolBySuffix(tools,'search'),action=toolBySuffix(tools,'action');await call(c,help,{query:toolId,limit:50,offset:0});await call(c,search,{toolId});return await call(c,action,{toolId,params});}finally{await c.close().catch(()=>{});}}
export async function executeBusinessTool(toolId,params){try{return await oneSession(toolId,params)}catch(e){if(!stale(e))throw e;console.warn(`LingXing schema stale for ${toolId}; creating a new MCP session and rediscovering schema.`);await wait(1500);return await oneSession(toolId,params);}}
export async function inspectMcp(){const {c,tools}=await newClient();try{return tools.filter(t=>['help','search','action'].some(s=>t.name===s||t.name.endsWith(`__${s}`))).map(t=>({name:t.name,description:t.description||''}));}finally{await c.close().catch(()=>{});}}
export function listOf(r){const p=parseResult(r);for(const x of [p?.data?.list,p?.data?.data,p?.data?.data?.list,p?.list,p?.data])if(Array.isArray(x))return x;return [];}
export function totalOf(r){const p=parseResult(r);return Number(p?.data?.total??p?.data?.count??p?.total??0);}
