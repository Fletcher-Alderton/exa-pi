# Security Policy

## Reporting a vulnerability

Please report security issues privately by opening a GitHub security advisory or contacting the maintainer through the repository owner profile. Do not include API keys or other secrets in public issues.

## API keys

`exa-pi` reads the Exa API key from Pi's auth file only:

- `~/.pi/agent/auth.json` provider key `exa`

Never commit real API keys. Rotate any key that may have been exposed.
