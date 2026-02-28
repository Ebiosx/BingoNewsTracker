import { useState, useEffect, useRef } from "react";

/*
  Design direction: "Quiet luxury" dark minimalism
  - Near-black bg, whisper-thin borders, single warm accent (amber)
  - Generous negative space, restrained type scale
  - Fonts: Instrument Serif (display) + Karla (body) — refined but warm
  - No gradients, no glows, no emojis in UI chrome
  - Micro-animations: opacity fades only, nothing bouncy
*/

const STORAGE_KEY = "bingo-tracker-v2";

const EMPTY_SQUARES = () =>
  Array.from({ length: 25 }, (_, i) => ({
    id: i,
    text: i === 12 ? "FREE SPACE" : "",
    marked: i === 12,
    matchedArticle: null,
    aiSuggested: false,
  }));

const DEFAULT_DATA = {
  players: [
    { name: "Player 1", card: { squares: EMPTY_SQUARES() } },
    { name: "Player 2", card: { squares: EMPTY_SQUARES() } },
  ],
  lastChecked: null,
};

const load = () => { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
const save = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} };

// ── Bingo logic ──
function checkBingo(squares) {
  const sz = 5;
  const lines = [];
  for (let r = 0; r < sz; r++) lines.push(Array.from({ length: sz }, (_, c) => r * sz + c));
  for (let c = 0; c < sz; c++) lines.push(Array.from({ length: sz }, (_, r) => r * sz + c));
  lines.push(Array.from({ length: sz }, (_, i) => i * sz + i));
  lines.push(Array.from({ length: sz }, (_, i) => i * sz + (sz - 1 - i)));
  const wins = lines.filter((l) => l.every((i) => squares[i].marked));
  return { hasBingo: wins.length > 0, winningIndices: new Set(wins.flat()), count: wins.length };
}

// ── Styles (CSS vars) ──
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Karla:wght@300;400;500;600&display=swap');

  :root {
    --bg: #0c0c0c;
    --surface: #141414;
    --surface2: #1a1a1a;
    --border: #222;
    --border-light: #2a2a2a;
    --text: #e8e8e8;
    --text-dim: #777;
    --text-muted: #444;
    --accent: #d4a053;
    --accent-dim: rgba(212,160,83,0.12);
    --accent-border: rgba(212,160,83,0.25);
    --green: #6cbf84;
    --green-dim: rgba(108,191,132,0.12);
    --red: #c75c5c;
    --blue: #6ba3be;
    --blue-dim: rgba(107,163,190,0.15);
    --serif: 'Instrument Serif', Georgia, serif;
    --sans: 'Karla', sans-serif;
    --radius: 6px;
    --radius-lg: 10px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); }
  ::selection { background: var(--accent-dim); color: var(--accent); }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ── Reusable button styles ──
const btnBase = {
  fontFamily: "var(--sans)",
  fontSize: "0.8rem",
  fontWeight: 500,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  cursor: "pointer",
  transition: "all 0.15s ease",
  letterSpacing: "0.2px",
};
const btnPrimary = { ...btnBase, background: "var(--accent)", color: "var(--bg)", border: "1px solid var(--accent)", padding: "9px 20px" };
const btnGhost = { ...btnBase, background: "transparent", color: "var(--text-dim)", padding: "9px 20px" };
const btnSmall = { ...btnBase, background: "transparent", color: "var(--text-dim)", padding: "5px 12px", fontSize: "0.75rem" };

// ── Upload Card Modal ──
function UploadModal({ isOpen, onClose, onResult }) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef(null);

  const toB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

  const process = async (file) => {
    setUploading(true);
    setError("");
    setStatus("Reading file…");

    try {
      const isImg = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";

      const prompt = `You are a bingo card reader. Extract exactly 25 squares from this 5x5 bingo card, reading left-to-right, top-to-bottom. The center (position 13) is typically FREE SPACE. If you see B/I/N/G/O column headers, skip them — only extract square content. Respond ONLY with a JSON array of 25 strings. No markdown, no explanation.`;

      let messages;
      if (isImg) {
        setStatus("AI is reading the image…");
        const b64 = await toB64(file);
        const mt = file.type.includes("png") ? "image/png" : file.type.includes("webp") ? "image/webp" : file.type.includes("gif") ? "image/gif" : "image/jpeg";
        messages = [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: b64 } }, { type: "text", text: prompt }] }];
      } else if (isPdf) {
        setStatus("AI is reading the PDF…");
        const b64 = await toB64(file);
        messages = [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: prompt }] }];
      } else {
        setStatus("Parsing text…");
        const txt = await file.text();
        messages = [{ role: "user", content: `${prompt}\n\nContent:\n${txt}` }];
      }

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages }),
      });

      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);

      const text = data.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      if (!Array.isArray(parsed) || parsed.length !== 25) throw new Error(`Expected 25 squares, got ${parsed?.length || 0}`);

      onResult(parsed.map((t, i) => (i === 12 ? "FREE SPACE" : String(t).trim())));
      setStatus("");
      onClose();
    } catch (e) {
      setError(e.message.includes("JSON") ? "Couldn't parse the card — try a clearer image." : e.message);
    }
    setUploading(false);
  };

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeIn 0.15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontFamily: "var(--serif)", color: "var(--text)", fontSize: "1.15rem", fontWeight: 400 }}>Upload card</h3>
          <button onClick={onClose} style={{ ...btnSmall, border: "none", color: "var(--text-muted)" }}>✕</button>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) process(f); }}
          onClick={() => !uploading && ref.current?.click()}
          style={{
            border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border-light)"}`,
            borderRadius: "var(--radius)",
            padding: "40px 20px",
            textAlign: "center",
            cursor: uploading ? "wait" : "pointer",
            background: dragOver ? "var(--accent-dim)" : "transparent",
            transition: "all 0.15s ease",
          }}
        >
          <input ref={ref} type="file" accept="image/*,.pdf,.txt,.csv" onChange={(e) => { if (e.target.files?.[0]) process(e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />

          {uploading ? (
            <>
              <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTop: "2px solid var(--accent)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontFamily: "var(--sans)", color: "var(--text-dim)", fontSize: "0.8rem" }}>{status}</p>
            </>
          ) : (
            <>
              <p style={{ fontFamily: "var(--sans)", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 500, marginBottom: 4 }}>
                Drop a file or click to browse
              </p>
              <p style={{ fontFamily: "var(--sans)", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                Image, PDF, or text file
              </p>
            </>
          )}
        </div>

        {error && (
          <p style={{ fontFamily: "var(--sans)", color: "var(--red)", fontSize: "0.8rem", marginTop: 12 }}>{error}</p>
        )}
      </div>
    </div>
  );
}

// ── News Scanner Modal ──
function ScanModal({ isOpen, onClose, onMatch, players }) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const scan = async () => {
    setScanning(true);
    setError(null);
    setResults([]);

    const topics = [...new Set(
      players.flatMap((p) => p.card.squares.filter((s) => !s.marked && s.text && s.text !== "FREE SPACE").map((s) => s.text))
    )];

    if (!topics.length) { setStatus("All squares are marked."); setScanning(false); return; }

    setStatus(`Scanning ${topics.length} topics…`);

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `You are a news matcher for a current events bingo game. Search recent news (last 7 days) matching ANY of these topics:\n\n${topics.map((t, i) => `${i + 1}. "${t}"`).join("\n")}\n\nRespond ONLY with a JSON array (no markdown, no preamble). Each element: {"square_text": "exact bingo text", "headline": "...", "summary": "1-2 sentences", "source": "...", "confidence": "high"|"medium"|"low"}\n\nNo matches? Return []`,
          }],
        }),
      });

      const data = await resp.json();
      const text = data.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n");

      if (text) {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setResults(Array.isArray(parsed) ? parsed : []);
        setStatus(parsed.length ? `${parsed.length} match${parsed.length > 1 ? "es" : ""} found` : "No matches found.");
      } else {
        setStatus("No results.");
      }
    } catch {
      setError("Connection failed.");
    }
    setScanning(false);
  };

  const apply = (r) => { onMatch(r); setResults((p) => p.filter((x) => x !== r)); };

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeIn 0.15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, width: "100%", maxWidth: 520, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontFamily: "var(--serif)", color: "var(--text)", fontSize: "1.15rem", fontWeight: 400 }}>News scanner</h3>
          <button onClick={onClose} style={{ ...btnSmall, border: "none", color: "var(--text-muted)" }}>✕</button>
        </div>

        {!scanning && results.length === 0 && !status && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p style={{ fontFamily: "var(--sans)", color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: 20 }}>
              Search recent news for matches against your unmarked squares.
            </p>
            <button onClick={scan} style={btnPrimary}>Scan now</button>
          </div>
        )}

        {scanning && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTop: "2px solid var(--accent)", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ fontFamily: "var(--sans)", color: "var(--text-dim)", fontSize: "0.8rem" }}>{status}</p>
          </div>
        )}

        {error && <p style={{ fontFamily: "var(--sans)", color: "var(--red)", fontSize: "0.8rem", textAlign: "center" }}>{error}</p>}

        {!scanning && status && results.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p style={{ fontFamily: "var(--sans)", color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: 16 }}>{status}</p>
            <button onClick={scan} style={btnGhost}>Scan again</button>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <p style={{ fontFamily: "var(--sans)", color: "var(--accent)", fontSize: "0.8rem", fontWeight: 500, marginBottom: 16 }}>{status}</p>
            {results.map((r, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, marginBottom: 8, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--sans)", fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: r.confidence === "high" ? "var(--green)" : r.confidence === "medium" ? "var(--accent)" : "var(--text-muted)" }}>
                      {r.confidence}
                    </span>
                    <span style={{ fontFamily: "var(--sans)", fontSize: "0.7rem", color: "var(--text-muted)" }}>·</span>
                    <span style={{ fontFamily: "var(--sans)", fontSize: "0.7rem", color: "var(--text-muted)" }}>{r.source}</span>
                  </div>
                  <p style={{ fontFamily: "var(--sans)", color: "var(--text)", fontSize: "0.8rem", fontWeight: 500, marginBottom: 2 }}>{r.headline}</p>
                  <p style={{ fontFamily: "var(--sans)", color: "var(--text-dim)", fontSize: "0.75rem", marginBottom: 4 }}>{r.summary}</p>
                  <p style={{ fontFamily: "var(--sans)", color: "var(--accent)", fontSize: "0.7rem" }}>→ {r.square_text}</p>
                </div>
                <button onClick={() => apply(r)} style={{ ...btnSmall, color: "var(--green)", borderColor: "rgba(108,191,132,0.25)", whiteSpace: "nowrap", flexShrink: 0 }}>Mark</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit Card Modal ──
function EditModal({ isOpen, onClose, player, onSave }) {
  const [name, setName] = useState("");
  const [squares, setSquares] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    if (player) {
      setName(player.name);
      setSquares(player.card.squares.map((s) => s.text));
    }
  }, [player]);

  if (!isOpen || !player) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeIn 0.15s ease" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <h3 style={{ fontFamily: "var(--serif)", color: "var(--text)", fontSize: "1.15rem", fontWeight: 400 }}>Edit card</h3>
            <button onClick={onClose} style={{ ...btnSmall, border: "none", color: "var(--text-muted)" }}>✕</button>
          </div>

          <label style={{ fontFamily: "var(--sans)", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 6 }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "9px 12px", color: "var(--text)", fontFamily: "var(--sans)", fontSize: "0.85rem", marginBottom: 24, outline: "none" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontFamily: "var(--sans)", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.8px" }}>Squares</label>
            <button onClick={() => setUploadOpen(true)} style={{ ...btnSmall, color: "var(--accent)", borderColor: "var(--accent-border)" }}>Upload card</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 28 }}>
            {squares.map((text, i) => (
              <input
                key={i}
                value={text}
                disabled={i === 12}
                onChange={(e) => { const n = [...squares]; n[i] = e.target.value; setSquares(n); }}
                style={{
                  background: i === 12 ? "var(--accent-dim)" : "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "8px 4px",
                  color: i === 12 ? "var(--accent)" : "var(--text)",
                  fontFamily: "var(--sans)",
                  fontSize: "0.65rem",
                  textAlign: "center",
                  minWidth: 0,
                  outline: "none",
                }}
                placeholder={i === 12 ? "" : `${i + 1}`}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={() => { onSave(name, squares); onClose(); }} style={btnPrimary}>Save</button>
          </div>
        </div>
      </div>

      <UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onResult={(sq) => { setSquares(sq); setUploadOpen(false); }} />
    </>
  );
}

// ── Bingo Square ──
function Square({ sq, idx, winning, onToggle }) {
  const isFree = idx === 12;
  const empty = !sq.text && !isFree;

  return (
    <button
      onClick={() => !isFree && !empty && onToggle()}
      onContextMenu={(e) => { e.preventDefault(); if (!isFree && !empty) onToggle(); }}
      style={{
        position: "relative",
        aspectRatio: "1",
        background: winning ? "var(--accent-dim)" : sq.marked ? "rgba(255,255,255,0.04)" : "transparent",
        border: winning ? "1px solid var(--accent-border)" : sq.aiSuggested && !sq.marked ? "1px solid rgba(107,163,190,0.3)" : "1px solid var(--border)",
        borderRadius: "var(--radius)",
        cursor: isFree || empty ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        transition: "all 0.12s ease",
        overflow: "hidden",
      }}
    >
      {sq.aiSuggested && !sq.marked && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--blue)" }} />
      )}

      <span style={{
        fontFamily: "var(--sans)",
        fontSize: "clamp(0.5rem, 1.1vw, 0.7rem)",
        fontWeight: sq.marked ? 500 : 400,
        color: sq.marked ? "var(--accent)" : isFree ? "var(--text-muted)" : empty ? "var(--text-muted)" : "var(--text-dim)",
        textAlign: "center",
        lineHeight: 1.25,
        wordBreak: "break-word",
        letterSpacing: "-0.1px",
      }}>
        {empty ? "—" : sq.text}
      </span>

      {sq.marked && !isFree && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: "65%", height: "65%", border: "1.5px solid var(--accent-border)", borderRadius: "50%" }} />
        </div>
      )}
    </button>
  );
}

// ── Player Card ──
function Card({ player, onUpdate, onEdit }) {
  const { hasBingo, winningIndices, count } = checkBingo(player.card.squares);
  const marked = player.card.squares.filter((s) => s.marked).length;
  const hasContent = player.card.squares.some((s, i) => i !== 12 && s.text);

  const toggle = (idx) => {
    const next = { ...player, card: { squares: player.card.squares.map((s, i) => i === idx ? { ...s, marked: !s.marked } : s) } };
    onUpdate(next);
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28, background: "var(--surface)", animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: "var(--serif)", color: "var(--text)", fontSize: "1.3rem", fontWeight: 400, marginBottom: 2 }}>{player.name}</h2>
          <p style={{ fontFamily: "var(--sans)", color: "var(--text-muted)", fontSize: "0.75rem" }}>
            {marked}/25
            {hasBingo && <span style={{ color: "var(--accent)", marginLeft: 8 }}>BINGO × {count}</span>}
          </p>
        </div>
        <button onClick={onEdit} style={btnSmall}>Edit</button>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 4 }}>
        {["B", "I", "N", "G", "O"].map((l) => (
          <div key={l} style={{ textAlign: "center", fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--text-muted)", fontSize: "0.85rem" }}>{l}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
        {player.card.squares.map((sq, i) => (
          <Square key={i} sq={sq} idx={i} winning={winningIndices.has(i)} onToggle={() => toggle(i)} />
        ))}
      </div>

      {!hasContent && (
        <p style={{ fontFamily: "var(--sans)", color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: 16 }}>
          Click Edit to add squares or upload a card
        </p>
      )}
    </div>
  );
}

// ── App ──
export default function App() {
  const [data, setData] = useState(() => load() || DEFAULT_DATA);
  const [editing, setEditing] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [tab, setTab] = useState(0);

  useEffect(() => { save(data); }, [data]);

  const updatePlayer = (i, p) => setData((d) => ({ ...d, players: d.players.map((x, j) => j === i ? p : x) }));

  const saveCard = (idx, name, texts) => {
    setData((d) => {
      const next = { ...d, players: [...d.players] };
      const old = next.players[idx].card.squares;
      next.players[idx] = {
        ...next.players[idx],
        name,
        card: { squares: texts.map((t, i) => ({ ...old[i], text: t, marked: i === 12 ? true : t === old[i].text ? old[i].marked : false })) },
      };
      return next;
    });
  };

  const handleMatch = (r) => {
    setData((d) => {
      const next = { ...d, players: d.players.map((p) => ({ ...p, card: { squares: p.card.squares.map((sq) => sq.text.toLowerCase() === r.square_text.toLowerCase() && !sq.marked ? { ...sq, aiSuggested: true, matchedArticle: `${r.headline} — ${r.source}` } : sq) } })) };
      next.lastChecked = new Date().toISOString();
      return next;
    });
  };

  const reset = () => { if (confirm("Reset all cards and progress?")) setData(DEFAULT_DATA); };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 0 }}>
      <style>{CSS}</style>

      {/* Header */}
      <header style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--serif)", color: "var(--text)", fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 400, lineHeight: 1.1, marginBottom: 4 }}>
              Bingo <span style={{ fontStyle: "italic", color: "var(--accent)" }}>Tracker</span>
            </h1>
            <p style={{ fontFamily: "var(--sans)", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Current events edition
              {data.lastChecked && <span> · last scan {new Date(data.lastChecked).toLocaleDateString()}</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setScanOpen(true)} style={btnPrimary}>Scan news</button>
            <button onClick={reset} style={btnGhost}>Reset</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 16px", display: "flex", gap: 4 }}>
        {data.players.map((p, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            style={{
              ...btnSmall,
              color: tab === i ? "var(--accent)" : "var(--text-muted)",
              borderColor: tab === i ? "var(--accent-border)" : "var(--border)",
              background: tab === i ? "var(--accent-dim)" : "transparent",
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 64px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
        {data.players.map((p, i) => (
          <div key={i} className={typeof window !== "undefined" && window.innerWidth < 820 && tab !== i ? "mobile-hidden" : ""}>
            <Card player={p} onUpdate={(u) => updatePlayer(i, u)} onEdit={() => setEditing(i)} />
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 819px) { .mobile-hidden { display: none !important; } }
        @media (min-width: 820px) { .mobile-hidden { display: block !important; } }
      `}</style>

      {/* Modals */}
      <EditModal isOpen={editing !== null} onClose={() => setEditing(null)} player={editing !== null ? data.players[editing] : null} onSave={(n, s) => saveCard(editing, n, s)} />
      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} onMatch={handleMatch} players={data.players} />
    </div>
  );
}
