import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthStorage } from "@mariozechner/pi-coding-agent";

import { getApiKey, getProxyUrlFromEnv } from "../index.ts";

test("reads the Exa apiKey from Pi auth.json storage", async () => {
  const authStorage = AuthStorage.inMemory({ exa: { type: "api_key", key: " auth-key " } });

  assert.equal(await getApiKey(authStorage), "auth-key");
});

test("reloads auth.json before reading the Exa apiKey", async () => {
  const dir = await mkdtemp(join(tmpdir(), "exa-pi-auth-test-"));
  const authPath = join(dir, "auth.json");
  await mkdir(dir, { recursive: true });
  await writeFile(authPath, "{}\n", "utf8");

  const authStorage = AuthStorage.create(authPath);
  await writeFile(authPath, `${JSON.stringify({ exa: { type: "api_key", key: "file-key" } }, null, 2)}\n`, "utf8");

  assert.equal(await getApiKey(authStorage), "file-key");
});

test("errors when the auth.json apiKey is empty", async () => {
  const authStorage = AuthStorage.inMemory({ exa: { type: "api_key", key: "   " } });

  await assert.rejects(
    () => getApiKey(authStorage),
    /Exa apiKey .* must be a non-empty string/,
  );
});

test("errors when auth.json does not contain an Exa credential", async () => {
  await assert.rejects(
    () => getApiKey(AuthStorage.inMemory({ openai: { type: "api_key", key: "openai-key" } })),
    /Missing Exa API key/,
  );
});

test("errors when the Exa auth.json credential is not an api_key", async () => {
  const authStorage = AuthStorage.inMemory({
    exa: { type: "oauth", access: "token", refresh: "refresh", expires: Date.now() + 1000 } as any,
  });

  await assert.rejects(
    () => getApiKey(authStorage),
    /must use \{ "type": "api_key", "key": "YOUR_KEY" \}/,
  );
});

test("reads proxy URL from environment in priority order", () => {
  assert.equal(getProxyUrlFromEnv({
    HTTPS_PROXY: " https://https-proxy.example:8443 ",
    ALL_PROXY: "http://all-proxy.example:8080",
  } as NodeJS.ProcessEnv), "https://https-proxy.example:8443");

  assert.equal(getProxyUrlFromEnv({
    all_proxy: "http://lower-all-proxy.example:8080",
  } as NodeJS.ProcessEnv), "http://lower-all-proxy.example:8080");
});
