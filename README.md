# Bingo News Tracker

A minimalist dark-mode web app for tracking current events against your custom bingo cards — powered by AI.

## API Keys

| Feature | Provider | Cost | Get a key |
|---|---|---|---|
| News scanning | The Guardian | Free, no card required | [open-platform.theguardian.com](https://open-platform.theguardian.com/access/) |
| Card image/PDF reading | Google Gemini Flash | Free tier (1,500 req/day) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Keys are entered via the **Settings** button in the app and stored in your browser's localStorage. The Guardian key is optional (a shared test key is used by default). The Google key is only needed if you want to upload card images or PDFs.

## Features

- **Two separate player cards** — one for each player
- **Upload existing bingo cards** — snap a photo, upload a PDF, or paste text; Gemini Flash reads and populates the grid
- **AI news scanning** — searches recent Guardian news to find matches against your unmarked squares
- **Manual override** — click any square to mark/unmark it yourself
- **Bingo detection** — automatically highlights winning lines
- **Persistent state** — your cards and progress survive page refreshes (localStorage)

## Getting Started

### Prerequisites

- Node.js 18+

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
3. **Scan news** — Hit "Scan news" to search recent Guardian articles for matches. Click "Mark" to mark matching squares.
4. **Win** — The app detects BINGO automatically when you complete a row, column, or diagonal.

## Tech Stack

- React 18 + Vite
- The Guardian Content API (news scanning — free)
- Google Gemini Flash API (card OCR — free tier)
- Vanilla CSS with CSS custom properties
- Instrument Serif + Karla typography
