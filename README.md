# exa-pi

Pi coding agent extension that adds Exa-powered web search tools.

## Tools

- `exa_search` — search the web with Exa.
- `exa_get_contents` — fetch cleaned content, highlights, or summaries for known URLs.
- `exa_find_similar` — find pages similar to a given URL.

## Requirements

- Pi coding agent with package support, tested with `@mariozechner/pi-coding-agent` 0.70.5+.
- Node.js 20.6.0 or newer.
- An Exa API key.

## Installation

Install from GitHub:

```bash
pi install https://github.com/Fletcher-Alderton/exa-pi
```

After an npm release, you can also install with:

```bash
pi install npm:exa-pi
```

Restart Pi or run `/reload` after installation.

## API key

Create an Exa API key at <https://dashboard.exa.ai/api-keys>, then add this exact provider entry to Pi's auth file at `~/.pi/agent/auth.json`:

```json
{
  "exa": {
    "type": "api_key",
    "key": "YOUR_KEY"
  }
}
```

The extension reads the stored `exa` credential from Pi auth storage and requires `type` to be `api_key`. The `key` value must be the literal Exa API key string.

Do not commit API keys.

## Usage examples

Ask Pi to use the tools naturally, for example:

- "Search the web for the latest Exa API docs."
- "Fetch the contents of https://example.com and summarize it."
- "Find articles similar to this URL."

Tool names are also available to the model directly:

### `exa_search`

Searches Exa and returns matching pages.

Common parameters:

- `query` — search query.
- `numResults` — result count from `1` to `100`, default `5`.
- `type` — `auto`, `neural`, `fast`, `deep-lite`, `deep`, `deep-reasoning`, or `instant`.
- `category` — optional category filter.
- `includeDomains` / `excludeDomains` — domain filters.
- `startPublishedDate` / `endPublishedDate` — `YYYY-MM-DD` date filters.
- `text`, `highlights`, `summary` — include additional page content.

### `exa_get_contents`

Fetches cleaned content for known URLs.

Common parameters:

- `urls` — URL list.
- `text`, `highlights`, `summary` — include page content formats.

### `exa_find_similar`

Finds pages similar to a URL.

Common parameters:

- `url` — source URL.
- `numResults` — result count from `1` to `100`, default `5`.
- `includeDomains` / `excludeDomains` — domain filters.
- `excludeSourceDomain` — exclude the source URL's domain.
- `startPublishedDate` / `endPublishedDate` — `YYYY-MM-DD` date filters.
- `text`, `highlights`, `summary` — include additional page content.

## Troubleshooting

### Missing API key

If a tool reports a missing API key, add the `exa` API-key entry shown above to `~/.pi/agent/auth.json`, then reload Pi.

### Invalid auth entry

The `exa` entry in `~/.pi/agent/auth.json` must use `"type": "api_key"`, and `key` must be a non-empty string.

### Invalid API key or Exa API errors

Verify the key in the Exa dashboard and check your account quota/billing status. The tool reports the Exa HTTP status and provider error body when available.

## Development

Install dependencies:

```bash
npm install
```

Run validation:

```bash
npm run validate
```

Individual checks:

```bash
npm run typecheck
npm test
```

## Release checklist

Before publishing:

1. Run `npm run validate`.
2. Confirm `npm pack --dry-run` includes only intended files.
3. Confirm no real API keys are present in tracked files or package contents.
4. Update the version in `package.json`.
5. Publish with `npm publish` when ready.

## License

MIT © Fletcher Alderton
