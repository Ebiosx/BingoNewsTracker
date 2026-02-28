# Bingo News Tracker

A minimalist dark-mode web app for tracking current events against your custom bingo cards — powered by AI.

## Features

- **Two separate player cards** — one for each player
- **Upload existing bingo cards** — snap a photo, upload a PDF, or paste text; AI reads and populates the grid
- **AI news scanning** — searches recent news via Claude API + web search to find matches against your unmarked squares
- **Manual override** — click any square to mark/unmark it yourself
- **Bingo detection** — automatically highlights winning lines
- **Persistent state** — your cards and progress survive page refreshes (localStorage)

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key (for AI features — news scanning and card upload)

### Install & Run

```bash
npm install
npm run dev
```

The app will open at `http://localhost:3000`.

### Build for Production

```bash
npm run build
npm run preview
```

## How to Use

1. **Set up cards** — Click "Edit" on each player's card, enter a name, and either type in your 25 squares or click "Upload card" to let AI read a photo/PDF of your existing card.
2. **Play** — As current events happen, click squares to mark them.
3. **Scan news** — Hit "Scan news" to have AI search recent articles for matches. Review suggestions and click "Mark" to flag them.
4. **Win** — The app detects BINGO automatically when you complete a row, column, or diagonal.

## Tech Stack

- React 18 + Vite
- Anthropic Claude API (Sonnet 4) with web search
- Vanilla CSS with CSS custom properties
- Instrument Serif + Karla typography

## Note on API Usage

The AI features (news scanning and card upload) make calls to the Anthropic Messages API directly from the browser. This works in environments where the API key is handled automatically (like Claude.ai artifacts). For standalone deployment, you'll want to proxy these calls through a backend to keep your API key secure.
