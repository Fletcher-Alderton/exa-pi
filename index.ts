import { StringEnum, Type } from "@mariozechner/pi-ai";
import { AuthStorage, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ProxyAgent } from "undici";

const EXA_BASE = "https://api.exa.ai";
const EXA_AUTH_PROVIDER = "exa";
const PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"] as const;

type FetchInitWithDispatcher = RequestInit & { dispatcher?: ProxyAgent };
export function getProxyUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of PROXY_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeApiKey(value: unknown, source: string): string {
  if (typeof value !== "string") throw new Error(`Exa apiKey in ${source} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Exa apiKey in ${source} must be a non-empty string.`);
  return trimmed;
}

export async function getApiKey(authStorage: AuthStorage): Promise<string> {
  authStorage.reload();
  const credential = authStorage.get(EXA_AUTH_PROVIDER);
  if (!credential) {
    throw new Error(
      'Missing Exa API key. Add { "exa": { "type": "api_key", "key": "YOUR_KEY" } } to ~/.pi/agent/auth.json.',
    );
  }
  if (credential.type !== "api_key") {
    throw new Error('Exa credential in ~/.pi/agent/auth.json must use { "type": "api_key", "key": "YOUR_KEY" }.');
  }
  if (typeof credential.key !== "string") {
    throw new Error("Exa credential key in ~/.pi/agent/auth.json must be a string.");
  }

  return normalizeApiKey(credential.key, "Pi auth.json provider \"exa\"");
}

let cachedProxyAgent: { url: string; agent: ProxyAgent } | undefined;

function getProxyAgent(proxyUrl: string): ProxyAgent {
  if (cachedProxyAgent?.url !== proxyUrl) cachedProxyAgent = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  return cachedProxyAgent.agent;
}

async function exaFetch(path: string, authStorage: AuthStorage, body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const proxyUrl = getProxyUrlFromEnv();
  const init: FetchInitWithDispatcher = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": await getApiKey(authStorage),
    },
    body: JSON.stringify(body),
    signal,
  };
  if (proxyUrl) init.dispatcher = getProxyAgent(proxyUrl);

  let resp: Response;
  try {
    resp = await fetch(`${EXA_BASE}${path}`, init);
  } catch (error) {
    if (!proxyUrl || signal?.aborted) throw error;
    const { dispatcher: _dispatcher, ...directInit } = init;
    resp = await fetch(`${EXA_BASE}${path}`, directInit);
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(`Exa API error (${resp.status}): ${JSON.stringify(err)}`);
  }
  return resp.json();
}

function formatResults(results: any[]): string {
  if (!results?.length) return "No results found.";
  return results.map((r: any, i: number) => {
    const parts = [`${i + 1}. ${r.title || "(no title)"}`];
    parts.push(`   URL: ${r.url}`);
    if (r.publishedDate) parts.push(`   Published: ${r.publishedDate}`);
    if (r.author) parts.push(`   Author: ${r.author}`);
    if (r.summary) parts.push(`   Summary: ${r.summary}`);
    if (r.highlights?.length) parts.push(`   Highlights: ${r.highlights.join(" ... ")}`);
    if (r.text) parts.push(`   Text: ${r.text.slice(0, 2000)}${r.text.length > 2000 ? "..." : ""}`);
    return parts.join("\n");
  }).join("\n\n");
}

function buildContents(text?: boolean, highlights?: boolean, summary?: boolean): Record<string, unknown> | undefined {
  const c: Record<string, unknown> = {};
  if (text) c.text = true;
  if (highlights) c.highlights = true;
  if (summary) c.summary = true;
  return Object.keys(c).length ? c : undefined;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "exa_search",
    label: "Exa Search",
    description: "Search the web using Exa's AI-powered search engine. Returns relevant web pages matching the query. Use for web research, finding recent sources, or current documentation.",
    promptSnippet: "Search the live web for relevant pages and optionally include highlights, summaries, or text excerpts.",
    promptGuidelines: ["Use exa_search when the user asks for web research, recent sources, or current documentation."],
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      numResults: Type.Optional(Type.Integer({ description: "Number of results (1-100, default 5)", minimum: 1, maximum: 100, default: 5 })),
      type: Type.Optional(StringEnum([
        "auto",
        "neural",
        "fast",
        "deep-lite",
        "deep",
        "deep-reasoning",
        "instant",
      ] as const, { description: "Search type (default: auto)", default: "auto" })),
      category: Type.Optional(Type.String({ description: "Category filter: company, research paper, news, personal site, people, financial report" })),
      includeDomains: Type.Optional(Type.Array(Type.String(), { description: "Only include results from these domains" })),
      excludeDomains: Type.Optional(Type.Array(Type.String(), { description: "Exclude results from these domains" })),
      startPublishedDate: Type.Optional(Type.String({ description: "Only results published after this date (YYYY-MM-DD)", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
      endPublishedDate: Type.Optional(Type.String({ description: "Only results published before this date (YYYY-MM-DD)", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
      text: Type.Optional(Type.Boolean({ description: "Include full page text in results" })),
      highlights: Type.Optional(Type.Boolean({ description: "Include key highlights from pages" })),
      summary: Type.Optional(Type.Boolean({ description: "Include AI-generated summary of each page" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const body: Record<string, unknown> = { query: params.query };
      body.numResults = params.numResults ?? 5;
      if (params.type) body.type = params.type;
      if (params.category) body.category = params.category;
      if (params.includeDomains?.length) body.includeDomains = params.includeDomains;
      if (params.excludeDomains?.length) body.excludeDomains = params.excludeDomains;
      if (params.startPublishedDate) body.startPublishedDate = params.startPublishedDate;
      if (params.endPublishedDate) body.endPublishedDate = params.endPublishedDate;
      const contents = buildContents(params.text, params.highlights, params.summary);
      if (contents) body.contents = contents;

      const data = await exaFetch("/search", _ctx.modelRegistry.authStorage, body, signal);
      const text = formatResults(data.results);
      return {
        content: [{ type: "text", text }],
        details: { resultCount: data.results?.length ?? 0 },
      };
    },
  });

  pi.registerTool({
    name: "exa_get_contents",
    label: "Exa Get Contents",
    description: "Fetch cleaned content from one or more URLs. Returns page text, highlights, and/or summaries. Use when you already have URLs and wants the page contents.",
    promptSnippet: "Fetch cleaned content from one or more known URLs.",
    promptGuidelines: ["Use exa_get_contents when the user already has URLs and wants the page contents."],
    parameters: Type.Object({
      urls: Type.Array(Type.String(), { description: "URLs to fetch content from" }),
      text: Type.Optional(Type.Boolean({ description: "Include full page text" })),
      highlights: Type.Optional(Type.Boolean({ description: "Include key highlights" })),
      summary: Type.Optional(Type.Boolean({ description: "Include AI-generated summary" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const body: Record<string, unknown> = { urls: params.urls };
      if (params.text) body.text = true;
      if (params.highlights) body.highlights = true;
      if (params.summary) body.summary = true;

      const data = await exaFetch("/contents", _ctx.modelRegistry.authStorage, body, signal);
      const failedUrls = data.results?.filter((r: any) => r.statusCode && r.statusCode !== 200) ?? [];
      let text = formatResults(data.results?.filter((r: any) => !r.statusCode || r.statusCode === 200) ?? []);
      if (failedUrls.length) {
        text += `\n\nFailed URLs:\n${failedUrls.map((r: any) => `  - ${r.url}: ${r.error || "unknown error"}`).join("\n")}`;
      }
      return {
        content: [{ type: "text", text }],
        details: { resultCount: data.results?.length ?? 0, failedCount: failedUrls.length },
      };
    },
  });

  pi.registerTool({
    name: "exa_find_similar",
    label: "Exa Find Similar",
    description: "Find web pages similar to a given URL. Use when the user provides a URL and wants to discover related pages or resources.",
    promptSnippet: "Find pages similar to a given URL.",
    promptGuidelines: ["Use exa_find_similar when the user provides a URL and wants related pages."],
    parameters: Type.Object({
      url: Type.String({ description: "URL to find similar pages for" }),
      numResults: Type.Optional(Type.Integer({ description: "Number of results (1-100, default 5)", minimum: 1, maximum: 100, default: 5 })),
      includeDomains: Type.Optional(Type.Array(Type.String(), { description: "Only include results from these domains" })),
      excludeDomains: Type.Optional(Type.Array(Type.String(), { description: "Exclude results from these domains" })),
      excludeSourceDomain: Type.Optional(Type.Boolean({ description: "Exclude results from source URL's domain" })),
      startPublishedDate: Type.Optional(Type.String({ description: "Only results published after this date (YYYY-MM-DD)", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
      endPublishedDate: Type.Optional(Type.String({ description: "Only results published before this date (YYYY-MM-DD)", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
      text: Type.Optional(Type.Boolean({ description: "Include full page text in results" })),
      highlights: Type.Optional(Type.Boolean({ description: "Include key highlights from pages" })),
      summary: Type.Optional(Type.Boolean({ description: "Include AI-generated summary of each page" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const body: Record<string, unknown> = { url: params.url };
      body.numResults = params.numResults ?? 5;
      if (params.includeDomains?.length) body.includeDomains = params.includeDomains;
      if (params.excludeDomains?.length) body.excludeDomains = params.excludeDomains;
      if (params.excludeSourceDomain !== undefined) body.excludeSourceDomain = params.excludeSourceDomain;
      if (params.startPublishedDate) body.startPublishedDate = params.startPublishedDate;
      if (params.endPublishedDate) body.endPublishedDate = params.endPublishedDate;
      const contents = buildContents(params.text, params.highlights, params.summary);
      if (contents) body.contents = contents;

      const data = await exaFetch("/findSimilar", _ctx.modelRegistry.authStorage, body, signal);
      const text = formatResults(data.results);
      return {
        content: [{ type: "text", text }],
        details: { resultCount: data.results?.length ?? 0 },
      };
    },
  });
}
