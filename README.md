# exa-pi

Pi coding agent extension that adds Exa-powered web search tools:

- `exa_search`
- `exa_get_contents`
- `exa_find_similar`

## API key

The extension reads the Exa API key from either:

1. `EXA_API_KEY` environment variable, or
2. `~/.pi/exa-api-key`, which can be written via the `/exa` command in Pi.

Do not commit API keys to this repository.
