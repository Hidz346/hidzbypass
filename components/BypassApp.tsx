"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, Check, ChevronDown, Clock3, Copy, ExternalLink, History, Layers3, Link2, Loader2, Moon, Route, Sun, Trash2, Zap } from "lucide-react";

type Hop = { hop: number; url: string; status: number; location?: string; elapsedMs: number };
type Result = { originalUrl: string; finalUrl: string; resolved: boolean; reason?: string; hops: Hop[]; elapsedMs: number };
type HistoryItem = { url: string; finalUrl: string; at: number; resolved?: boolean; hops?: Hop[]; elapsedMs?: number };

const ENGINES = ["HTTP Redirect", "Meta Refresh", "JavaScript Redirect", "Encoded Redirect", "Query Parameter", "JSON Destination", "Cookie-Aware Session", "Intermediate Link", "SFL Dedicated Resolver"];
const STEPS = [{ key: "connect", label: "Menghubungi tautan tujuan" }, { key: "trace", label: "Mengikuti setiap pengalihan" }, { key: "verify", label: "Memverifikasi tautan akhir" }];

function cleanInput(v: string) {
  const t = v.trim();
  return !t ? "" : /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
export default function BypassApp() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [visualStep, setVisualStep] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mounted, setMounted] = useState(false);
  const [showEngines, setShowEngines] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const cur = document.documentElement.dataset.theme;
      if (cur === "dark" || cur === "light") setTheme(cur);
      const saved = JSON.parse(window.localStorage.getItem("hidz-bypass-history") || "[]");
      if (Array.isArray(saved)) setHistory(saved.slice(0, 10));
    } catch {}
    function onStorage(e: StorageEvent) {
      if (e.key === "hidz-theme" && (e.newValue === "dark" || e.newValue === "light")) {
        setTheme(e.newValue);
        document.documentElement.dataset.theme = e.newValue;
      }
      if (e.key === "hidz-bypass-history") {
        try { const p = JSON.parse(e.newValue || "[]"); if (Array.isArray(p)) setHistory(p.slice(0, 10)); } catch {}
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("hidz-theme", next); } catch {}
  }

  const canRun = useMemo(() => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(cleanInput(url)), [url]);

  async function run() {
    const target = cleanInput(url);
    if (!target) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true); setError(""); setResult(null); setCopied(false); setVisualStep(0);
    const adv = window.setInterval(() => setVisualStep((c: number) => (c < STEPS.length - 1 ? c + 1 : c)), 550);
    try {
      const res = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }), signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal memproses tautan.");
      const r: Result = data.result;
      setVisualStep(STEPS.length - 1);
      setResult(r);
      setHistory((cur: HistoryItem[]) => {
        const next = [{ url: target, finalUrl: r.finalUrl, at: Date.now(), resolved: r.resolved, hops: r.hops, elapsedMs: r.elapsedMs }, ...cur.filter((i: HistoryItem) => i.url !== target)].slice(0, 10);
        try { window.localStorage.setItem("hidz-bypass-history", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Gagal memproses tautan.");
    } finally {
      window.clearInterval(adv);
      if (abortRef.current === ctrl) setBusy(false);
    }
  }

  async function handleQuickBtn() {
    if (url.trim()) { setUrl(""); setError(""); return; }
    try { const c = await navigator.clipboard.readText(); if (c.trim()) setUrl(c.trim()); } catch {}
  }

  async function copyResult() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.finalUrl); } catch {}
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Image src="/brand-logo.png" alt="HIDZ BYPASS" width={40} height={40} priority /></div>
          <div><strong>HIDZ BYPASS</strong><span>Resolver Tautan Publik</span></div>
        </div>
        <button className="icon-btn" onClick={toggleTheme} aria-label="Ganti tema">{mounted && theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      </header>
      <section className="hero">
        <div className="eyebrow"><Zap size={13} /> PUBLIC REDIRECT RESOLVER</div>
        <h1>Telusuri rantai tautan.<br /><span>Temukan tujuan aslinya.</span></h1>
        <p>Tempel tautan pendek, wrapper iklan, atau redirect apa pun. HidzBypass menelusuri seluruh rantai pengalihan di server dan menampilkan URL tujuan sebenarnya secara instan.</p>
      </section>
      <section className="panel">
        <label htmlFor="target">Tautan yang ingin ditelusuri</label>
        <div className="input-row">
          <div className="input-wrap">
            <Link2 size={17} />
            <input id="target" value={url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && canRun && !busy) run(); }} placeholder="sfl.gl/kode, bit.ly/..., atau tautan pendek lainnya" autoComplete="off" spellCheck={false} />
            <button type="button" className="quick-btn" onClick={handleQuickBtn}>{url.trim() ? "Hapus" : "Tempel"}</button>
          </div>
          <button className="run-btn" onClick={run} disabled={!canRun || busy}>{busy ? <><Loader2 size={17} className="spin" /> Menelusuri...</> : <><ArrowLeftRight size={17} /> Telusuri Tautan</>}</button>
        </div>
        <p className="hint-line">Awalan <b>https://</b> otomatis ditambahkan bila belum ditulis.</p>
        <button className="engine-toggle" onClick={() => setShowEngines(!showEngines)}><Layers3 size={15} /> Metode penelusuran ({ENGINES.length}) <ChevronDown className={showEngines ? "rotate" : ""} size={15} /></button>
        {showEngines && <div className="engine-list">{ENGINES.map((e) => <span key={e}>{e}</span>)}</div>}
        {error && <div className="error-box">{error}</div>}
      </section>
      {busy && (
        <section className="progress-panel" aria-live="polite">
          <div className="progress-head"><Route size={16} className="spin-slow" /> Sedang menelusuri rantai pengalihan</div>
          <div className="progress-bar">{STEPS.map((s, i) => <span key={s.key} className={i <= visualStep ? "seg filled" : "seg"} />)}</div>
          <ol className="progress-steps">{STEPS.map((s, i) => <li key={s.key} className={i < visualStep ? "done" : i === visualStep ? "active" : "pending"}><span className="step-icon">{i < visualStep ? <Check size={12} /> : i === visualStep ? <Loader2 size={12} className="spin" /> : <span className="dot" />}</span>{s.label}</li>)}</ol>
        </section>
      )}
      {result && (
        <section className="result-card">
          <div className="result-head">
            <div className="result-tabs">
              <span className={`tab ${result.resolved ? "clean" : "warn"}`}>{result.resolved ? <Check size={14} /> : <Clock3 size={14} />} {result.resolved ? "Tujuan ditemukan" : "Tujuan tidak ditemukan"}</span>
              <span className="tab safe">{result.hops.length} hop</span>
            </div>
            <p className="result-meta"><Clock3 size={14} /> {result.elapsedMs} ms</p>
          </div>
          <div className="url-box final-url-box">{result.resolved ? <a href={result.finalUrl} target="_blank" rel="noopener noreferrer">{result.finalUrl}</a> : <span>{result.finalUrl}</span>}</div>
          <div className="result-actions">
            <button className="run-btn small" onClick={copyResult} disabled={!result.resolved}>{copied ? <><Check size={16} /> Tersalin</> : <><Copy size={16} /> Salin URL Tujuan</>}</button>
            {result.resolved && <a className="secondary-btn" href={result.finalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Buka Tautan</a>}
          </div>
          <details className="hop-details"><summary>Rincian rantai pengalihan ({result.hops.length} hop)</summary><div>{result.hops.map((h: Hop) => <div className="hop" key={`${h.hop}-${h.url}`}><b>#{h.hop}</b><span>{h.status || "ERR"}</span><code>{h.url}</code></div>)}</div></details>
        </section>
      )}
      <section className="lower-grid">
        <div className="info-card"><div className="section-title"><span>01</span><h2>Cara Kerja</h2></div><div className="steps"><div><b>01</b><p>Masukkan tautan pendek atau wrapper publik yang ingin diperiksa.</p></div><div><b>02</b><p>Server menelusuri redirect HTTP, JavaScript, meta refresh, hingga sesi secara otomatis.</p></div><div><b>03</b><p>URL tujuan ditampilkan lengkap dengan rincian setiap hop secara transparan.</p></div></div></div>
        <div className="info-card"><div className="section-title"><span>02</span><h2>Keamanan &amp; Privasi</h2></div><p className="body-copy">Setiap permintaan diverifikasi agar tidak mengarah ke jaringan privat (proteksi SSRF), tanpa menyimpan log riwayat di server.</p><div className="chips"><span>MAKS 20 HOP</span><span>TANPA DATABASE</span><span>PROTEKSI SSRF</span></div></div>
      </section>
      <section className="history-card">
        <div className="section-title"><span><History size={15} /></span><h2>Riwayat Perangkat</h2><button className="clear-btn" onClick={() => { setHistory([]); window.localStorage.removeItem("hidz-bypass-history"); }} disabled={!history.length}><Trash2 size={14} /> Hapus</button></div>
        {!history.length ? <p className="muted">Belum ada riwayat penelusuran di perangkat ini.</p> : (
          <div className="history-list">{history.map((item: HistoryItem) => (
            <div className="history-item" key={item.at}>
              <button type="button" className="history-main" onClick={() => { setUrl(item.url); setResult({ originalUrl: item.url, finalUrl: item.finalUrl, resolved: item.resolved ?? true, hops: item.hops ?? [{ hop: 1, url: item.url, status: 200, elapsedMs: 0 }], elapsedMs: item.elapsedMs ?? 0 }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><strong>{item.url}</strong><span>{item.finalUrl}</span></button>
              <div className="history-meta"><small>{new Date(item.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</small></div>
            </div>
          ))}</div>
        )}
      </section>
      <footer>HidzBypass &mdash; bagian dari ekosistem HidzProject</footer>
    </main>
  );
}
