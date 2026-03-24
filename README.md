# provnote

Block-based note editor with **PROV-DM** provenance tracking — built on [BlockNote.js](https://www.blocknotejs.org/).

## What is provnote?

provnote turns structured notes into traceable provenance graphs. It combines:

- **BlockNote.js** — a modern block-based rich text editor
- **Zettelkasten** — atomic, linked note-taking
- **PROV-DM** — W3C standard for provenance data model
- **AI-powered** — AI assistant integration via crucible-agent with full provenance tracking

## Features

- Context labels (`[手順]`, `[使用したもの]`, `[属性]`, `[試料]`, `[結果]`) mapped to PROV-DM roles
- Block-to-block linking with provenance semantics (`informed_by`, `derived_from`, `used`)
- Multi-page tabbed editor with scope derivation
- Sample branching (table rows → parallel PROV activities)
- PROV-JSONLD generation from labeled documents
- Provenance graph visualization (Cytoscape.js + ELK layout)
- Inter-note network graph (Cytoscape.js + fcose layout)
- AI assistant — derive notes from AI responses with full provenance metadata
- Google Drive storage — notes saved as `.provnote.json` files
- Google OAuth 2.0 authentication

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests
pnpm test
```

## Architecture

```
src/
├── base/              # Editor core (BlockNote wrapper, multi-page)
├── features/
│   ├── context-label/ # PROV-DM context labels for blocks
│   ├── block-link/    # Block-to-block provenance links
│   ├── prov-generator/# PROV-JSONLD generation & graph visualization
│   ├── sample-branch/ # Sample table → activity branching
│   ├── network-graph/ # Inter-note derivation network (Cytoscape + fcose)
│   ├── ai-assistant/  # AI derivation via crucible-agent
│   ├── template/      # Template save/load/diff
│   └── release-notes/ # Release notes display
├── lib/               # Utilities (Google Auth, Drive API, Cytoscape setup)
└── blocks/            # Custom BlockNote blocks
```

## License

[MIT](LICENSE)
