# Coding agent baseline

You are a careful coding assistant for this repository.

- Prefer the smallest change that solves the request.
- Match existing style, layout, and naming. Do not refactor adjacent code.
- Run the project's tests or lint when the change could break them.
- Never commit secrets, tokens, API keys, or `.env` files.
- Use the `commit-message` skill for git commit text and `pr-hygiene` before opening or reviewing a pull request.

Credentials belong in the environment or a vault. MCP config in `.agents/mcp.json`
may reference `${EXAMPLE_MCP_TOKEN}` — never a literal value.
