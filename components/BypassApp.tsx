"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeftRight, Check, ChevronDown, Clock3, Copy, ExternalLink,
  History, Layers3, Link2, Loader2, Moon, Route, Sun, Trash2, Zap
} from "lucide-react";

type Result = {
  originalUrl: string;
  finalUrl: string;
  resolved: boolean;
  reason?:
    | "REDIRECT_RESOLVED"
    | "NO_DESTINATION_FOUND"
    | "SAME_URL"
    | "HTTP_403_FORBIDDEN"
    | "HTTP_4XX"
    | "TARGET_UNREACHABLE";
  hops: { hop: number; url: string; status: number; location?: string; elapsedMs: number }[];
  elapsedMs: number;
};

type HistoryItem = { url: string; finalUrl: string; at: number };

// Daftar ini mengikuti persis metode deteksi pada lib/resolve.ts —
// bukan istilah pemasaran, agar informasinya tetap akurat.
const ENGINES = [
  "HTTP Redirect", "Meta Refresh", "JavaScript Redirect", "Encoded Redirect",
  "Query Parameter", "JSON Destination", "Cookie-Aware Session",
  "Intermediate Link", "SFL Dedicated Resolver"
];

const STEPS = [
  { key: "connect", label: "Menghubungi tautan tujuan" },
  { key: "trace", label: "Mengikuti setiap pengalihan" },
  { key: "verify", label: "Memverifikasi tautan akhir" }
];

function cleanInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function readStoredTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("hidz-theme");
  return saved === "dark" || saved === "light" ? saved : "light";
}

export default function BypassApp() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [visualStep, setVisualStep] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  // Nilai awal dibaca langsung (bukan lewat efek terpisah) supaya state React
  // sudah benar sejak render pertama dan tidak sempat "flip" balik ke tema
  // default sebelum localStorage terbaca.
  const [theme, setTheme] = useState<"dark" | "light">(readStoredTheme);
  const [showEngines, setShowEngines] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("hidz-bypass-history") || "[]");
      if (Array.isArray(saved)) setHistory(saved.slice(0, 10));
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("hidz-theme", theme);
  }, [theme]);

  const canRun = useMemo(() => /^https?:\/\//i.test(cleanInput(url)), [url]);

  async function run() {
    const target = cleanInput(url);
    if (!target) return;

    setBusy(true);
    setError("");
    setResult(null);
    setCopied(false);
    setVisualStep(0);

    const advance = window.setInterval(() => {
      setVisualStep((current) => (current < STEPS.length - 1 ? current + 1 : current));
    }, 650);

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Gagal memproses tautan.");

      setVisualStep(STEPS.length - 1);
      setResult(data.result);
      setHistory((current) => {
        const next = [
          { url: target, finalUrl: data.result.finalUrl, at: Date.now() },
          ...current.filter((item) => item.url !== target)
        ].slice(0, 10);
        window.localStorage.setItem("hidz-bypass-history", JSON.stringify(next));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses tautan.");
    } finally {
      window.clearInterval(advance);
      setBusy(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result.finalUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function clearHistory() {
    setHistory([]);
    window.localStorage.removeItem("hidz-bypass-history");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Image src="/brand-logo.png" alt="HIDZ BYPASS" width={50} height={50} priority />
          </div>
          <div>
            <strong>HIDZ BYPASS</strong>
            <span>RESOLVER TAUTAN</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ganti tema">
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><Zap size={14} /> PUBLIC REDIRECT RESOLVER</div>
        <h1>UNSHORTEN.<br /><span>Temukan tujuan aslinya.</span></h1>
        <p>Tempel tautan pendek, wrapper iklan, atau redirect apa pun — HidzBypass menelusuri seluruh rantai pengalihan di server dan menampilkan URL tujuan sebenarnya, tanpa menyimpan riwayat pencarian Anda.</p>
      </section>

      <section className="panel">
        <label htmlFor="target">Tautan yang ingin ditelusuri</label>
        <div className="input-row">
          <div className="input-wrap">
            <Link2 size={18} />
            <input
              id="target"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") run(); }}
              placeholder="sfl.gl/kode, atau tautan pendek lainnya"
              autoComplete="off"
            />
          </div>
          <button className="run-btn" onClick={run} disabled={!canRun || busy}>
            {busy ? <><Loader2 size={19} className="spin" /> Menelusuri...</> : <><ArrowLeftRight size={19} /> Telusuri Tautan</>}
          </button>
        </div>

        <p className="hint-line"><b>Tips:</b> awalan https:// otomatis ditambahkan bila belum Anda tulis.</p>

        <button className="engine-toggle" onClick={() => setShowEngines(!showEngines)}>
          <Layers3 size={17} /> Metode penelusuran yang didukung ({ENGINES.length}) <ChevronDown className={showEngines ? "rotate" : ""} size={17} />
        </button>

        {showEngines && <div className="engine-list">{ENGINES.map((engine) => <span key={engine}>{engine}</span>)}</div>}

        {error && <div className="error-box">{error}</div>}
      </section>

      {busy && (
        <section className="progress-panel" aria-live="polite">
          <div className="progress-head"><Route size={17} className="spin-slow" /> Sedang menelusuri rantai pengalihan</div>
          <div className="progress-bar">
            {STEPS.map((step, index) => (
              <span key={step.key} className={index <= visualStep ? "seg filled" : "seg"} />
            ))}
          </div>
          <ol className="progress-steps">
            {STEPS.map((step, index) => (
              <li key={step.key} className={index < visualStep ? "done" : index === visualStep ? "active" : "pending"}>
                <span className="step-icon">
                  {index < visualStep ? <Check size={13} /> : index === visualStep ? <Loader2 size={13} className="spin" /> : <span className="dot" />}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
        </section>
      )}

      {result && (
        <section className="result-card">
          <div className="result-head">
            <div>
              <div className="result-tabs">
                <span className={`tab ${result.resolved ? "clean" : "warn"}`}>
                  {result.resolved ? <Check size={15} /> : <Clock3 size={15} />} {result.resolved ? "Tujuan ditemukan" : "Tujuan tidak ditemukan"}
                </span>
                <span className={`tab ${result.resolved ? "safe" : "warn"}`}>{result.resolved ? "Berhasil" : "Gagal"}</span>
              </div>
              <p><Clock3 size={15} /> {result.hops.length} hop diperiksa · {result.elapsedMs} ms</p>
            </div>
            <span className="status-dot">LIVE</span>
          </div>

          <div className="url-box final-url-box">
            {result.resolved ? (
              <a href={result.finalUrl} target="_blank" rel="noopener noreferrer" title="Buka tautan akhir">
                {result.finalUrl}
              </a>
            ) : (
              <span>{result.finalUrl}</span>
            )}
          </div>

          <div className="result-actions">
            <button className="run-btn small" onClick={copyResult} disabled={!result.resolved}>
              {copied ? <><Check size={17} /> Tersalin</> : <><Copy size={17} /> {result.resolved ? "Salin URL bersih" : "Tidak ada URL akhir"}</>}
            </button>
            {result.resolved && (
              <a className="secondary-btn" href={result.finalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={17} /> Buka di tab baru
              </a>
            )}
          </div>

          {!result.resolved && (
            <div className="result-note">
              {result.reason === "HTTP_403_FORBIDDEN"
                ? "Server tujuan menolak permintaan ini dengan kode 403. HidzBypass tidak menganggap halaman penolakan sebagai tautan akhir."
                : result.reason === "HTTP_4XX"
                  ? `Server tujuan mengembalikan kode ${result.hops[result.hops.length - 1]?.status ?? 400}. Tidak ada tujuan publik yang bisa dipastikan.`
                  : "Tidak ditemukan pengalihan publik yang bisa dipastikan dari tautan ini. Kemungkinan tautan ini membutuhkan browser aktif, sesi masuk, interaksi manual, atau proteksi anti-bot."}
            </div>
          )}

          <details className="hop-details">
            <summary>Lihat rincian rantai pengalihan</summary>
            <div>{result.hops.map((hop) => (
              <div className="hop" key={`${hop.hop}-${hop.url}`}>
                <b>{hop.hop}</b><span>{hop.status}</span><code>{hop.url}</code>
              </div>
            ))}</div>
          </details>
        </section>
      )}

      <section className="lower-grid">
        <div className="info-card">
          <div className="section-title"><span>01</span><h2>Cara kerja</h2></div>
          <div className="steps">
            <div><b>01</b><p>Masukkan tautan publik yang ingin diperiksa.</p></div>
            <div><b>02</b><p>Server menelusuri redirect HTTP, JavaScript, meta refresh, hingga rantai berbasis cookie — tanpa perlu interaksi manual dari Anda.</p></div>
            <div><b>03</b><p>URL tujuan ditampilkan lengkap dengan rincian setiap hop, agar prosesnya tetap transparan.</p></div>
          </div>
        </div>
        <div className="info-card">
          <div className="section-title"><span>02</span><h2>Aman secara default</h2></div>
          <p className="body-copy">Setiap permintaan diverifikasi agar tidak mengarah ke jaringan privat, kredensial tertanam, atau skema non-HTTP — mengurangi risiko SSRF pada setiap pengalihan yang diproses.</p>
          <div className="chips"><span>20 HOP MAKSIMAL</span><span>TANPA PENYIMPANAN URL</span><span>PROTEKSI SSRF</span></div>
        </div>
      </section>

      <section className="history-card">
        <div className="section-title">
          <span><History size={17} /></span>
          <h2>Riwayat terakhir</h2>
          <button className="clear-btn" onClick={clearHistory} disabled={!history.length}><Trash2 size={15} /> Hapus</button>
        </div>
        {!history.length ? (
          <p className="muted">Belum ada riwayat di perangkat ini.</p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <button key={item.at} onClick={() => { setUrl(item.url); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <span>{item.url}</span>
                <small>{new Date(item.at).toLocaleString("id-ID")}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer>HIDZ PROJECT · HIDZ BYPASS · RESOLVER TAUTAN PUBLIK</footer>
    </main>
  );
}
