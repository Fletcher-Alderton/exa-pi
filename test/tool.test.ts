import assert from "node:assert/strict";
import test from "node:test";

import { AuthStorage } from "@mariozechner/pi-coding-agent";

import exaExtension from "../index.ts";

type ToolContext = { modelRegistry: { authStorage: AuthStorage } };

type RegisteredTool = {
  name: string;
  execute: (toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: ToolContext) => Promise<any>;
};

function registerTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  exaExtension({
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as any);
  return tools;
}

function makeContext(apiKey = "test-key"): ToolContext {
  return {
    modelRegistry: {
      authStorage: AuthStorage.inMemory({ exa: { type: "api_key", key: apiKey } }),
    },
  };
}

test("exa_search sends the expected Exa request and formats results", async () => {
  const ctx = makeContext("auth-key");
  const tools = registerTools();
  const search = tools.get("exa_search");
  assert.ok(search);

  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://api.exa.ai/search");
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>)["x-api-key"], "auth-key");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        query: "pi extensions",
        numResults: 2,
        type: "auto",
        includeDomains: ["example.com"],
        contents: { summary: true },
      });

      return new Response(JSON.stringify({
        results: [{ title: "Result", url: "https://example.com", summary: "Summary text" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await search.execute("call-1", {
      query: "pi extensions",
      numResults: 2,
      type: "auto",
      includeDomains: ["example.com"],
      summary: true,
    }, undefined, undefined, ctx);

    assert.equal(result.details.resultCount, 1);
    assert.match(result.content[0].text, /1\. Result/);
    assert.match(result.content[0].text, /URL: https:\/\/example\.com/);
    assert.match(result.content[0].text, /Summary: Summary text/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("exa_get_contents reports failed URLs", async () => {
  const ctx = makeContext();
  const tools = registerTools();
  const getContents = tools.get("exa_get_contents");
  assert.ok(getContents);

  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://api.exa.ai/contents");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        urls: ["https://ok.example", "https://bad.example"],
        text: true,
      });

      return new Response(JSON.stringify({
        results: [
          { title: "OK", url: "https://ok.example", text: "Clean text" },
          { url: "https://bad.example", statusCode: 404, error: "not found" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await getContents.execute("call-2", {
      urls: ["https://ok.example", "https://bad.example"],
      text: true,
    }, undefined, undefined, ctx);

    assert.equal(result.details.resultCount, 2);
    assert.equal(result.details.failedCount, 1);
    assert.match(result.content[0].text, /1\. OK/);
    assert.match(result.content[0].text, /Failed URLs:/);
    assert.match(result.content[0].text, /https:\/\/bad\.example: not found/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("exa_find_similar sends optional filters and content options", async () => {
  const ctx = makeContext();
  const tools = registerTools();
  const similar = tools.get("exa_find_similar");
  assert.ok(similar);

  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://api.exa.ai/findSimilar");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        url: "https://source.example",
        numResults: 3,
        excludeDomains: ["source.example"],
        excludeSourceDomain: true,
        startPublishedDate: "2026-01-01",
        endPublishedDate: "2026-04-28",
        contents: { highlights: true },
      });

      return new Response(JSON.stringify({
        results: [{ title: "Similar", url: "https://similar.example", highlights: ["important"] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await similar.execute("call-3", {
      url: "https://source.example",
      numResults: 3,
      excludeDomains: ["source.example"],
      excludeSourceDomain: true,
      startPublishedDate: "2026-01-01",
      endPublishedDate: "2026-04-28",
      highlights: true,
    }, undefined, undefined, ctx);

    assert.equal(result.details.resultCount, 1);
    assert.match(result.content[0].text, /1\. Similar/);
    assert.match(result.content[0].text, /Highlights: important/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Exa HTTP errors include status and provider body", async () => {
  const ctx = makeContext();
  const tools = registerTools();
  const similar = tools.get("exa_find_similar");
  assert.ok(similar);

  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "bad key" }), {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    await assert.rejects(
      similar.execute("call-4", { url: "https://example.com" }, undefined, undefined, ctx),
      /Exa API error \(401\).*bad key/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("proxy fetch failure retries direct", async () => {
  const ctx = makeContext();
  const tools = registerTools();
  const search = tools.get("exa_search");
  assert.ok(search);

  const previousFetch = globalThis.fetch;
  const previousProxy = process.env.HTTPS_PROXY;
  let calls = 0;
  try {
    process.env.HTTPS_PROXY = "http://proxy.example:8080";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit & { dispatcher?: unknown }) => {
      calls += 1;
      if (calls === 1) {
        assert.ok(init?.dispatcher);
        throw new Error("proxy unreachable");
      }
      assert.equal(init?.dispatcher, undefined);
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await search.execute("call-5", { query: "x" }, undefined, undefined, ctx);
    assert.equal(calls, 2);
    assert.equal(result.details.resultCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = previousProxy;
  }
});
