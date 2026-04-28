import assert from "node:assert/strict";
import test from "node:test";

import { AuthStorage } from "@mariozechner/pi-coding-agent";

import { getApiKey } from "../index.ts";

test("reads the Exa apiKey from Pi auth.json storage", async () => {
  const authStorage = AuthStorage.inMemory({ exa: { type: "api_key", key: " auth-key " } });

  assert.equal(await getApiKey(authStorage), "auth-key");
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
