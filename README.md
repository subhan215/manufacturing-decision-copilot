# AI Manufacturing Decision Copilot

Sofstica Hackathon 2026 submission — Track 1: Supplier Shortlisting.

**Status: scaffold only.** Full setup instructions, architecture explanation, and usage docs required by the submission checklist will be written here as the app is built. See `CLAUDE.md` for full project context and current progress.

## Requirements

- Node.js and npm
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) installed and authenticated (`claude login`) — this app uses `@anthropic-ai/claude-agent-sdk` against your local Claude Code session, not a separate Anthropic API key. See `.env.local.example`.

## Setup

```bash
npm install
npm run dev
```

Then open http://localhost:3000.
