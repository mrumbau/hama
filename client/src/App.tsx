import React, { useMemo, useState } from "react";

type ResultItem = { url: string; score: number };

export default function App() {
  const [imageBase64, setImageBase64] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(75);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [meta, setMeta] = useState<any>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [topResults, setTopResults] = useState<ResultItem[]>([]);

  const canSearch = useMemo(() => !!imageBase64, [imageBase64]);

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Failed to read file"));
      r.readAsDataURL(file);
    });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr("");
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await readFileAsDataUrl(f);
    setImageBase64(dataUrl);
  }

  async function onSearch() {
    setErr("");
    setLoading(true);
    setResults([]);
    setTopResults([]);
    setMeta(null);

    try {
      const r = await fetch("/api/search-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          query: query.trim() || undefined,
          threshold,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail || j?.error || "Search failed");

      setMeta(j);
      setResults(Array.isArray(j?.results) ? j.results : []);
      setTopResults(Array.isArray(j?.topResults) ? j.topResults : []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#020617",
      color: "#e2e8f0",
      fontFamily: "Arial, sans-serif",
    } as React.CSSProperties,
    container: {
      maxWidth: "1100px",
      margin: "0 auto",
      padding: "24px",
    } as React.CSSProperties,
    title: {
      fontSize: "28px",
      fontWeight: 700,
      marginBottom: "8px",
    } as React.CSSProperties,
    subtitle: {
      color: "#cbd5e1",
      marginBottom: "24px",
    } as React.CSSProperties,
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "16px",
    } as React.CSSProperties,
    card: {
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: "16px",
      padding: "16px",
    } as React.CSSProperties,
    sectionTitle: {
      fontWeight: 700,
      marginBottom: "12px",
    } as React.CSSProperties,
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid #334155",
      background: "#020617",
      color: "#e2e8f0",
      boxSizing: "border-box",
      marginTop: "8px",
    } as React.CSSProperties,
    button: {
      width: "100%",
      marginTop: "12px",
      padding: "12px 16px",
      borderRadius: "10px",
      border: "none",
      background: loading || !canSearch ? "#475569" : "#4f46e5",
      color: "#fff",
      fontWeight: 700,
      cursor: loading || !canSearch ? "not-allowed" : "pointer",
    } as React.CSSProperties,
    previewBox: {
      height: "220px",
      borderRadius: "12px",
      border: "1px dashed #334155",
      background: "#020617",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#94a3b8",
      overflow: "hidden",
    } as React.CSSProperties,
    previewImg: {
      width: "100%",
      maxHeight: "320px",
      objectFit: "contain",
      borderRadius: "12px",
      border: "1px solid #1e293b",
      background: "#020617",
    } as React.CSSProperties,
    info: {
      marginTop: "12px",
      padding: "12px",
      borderRadius: "12px",
      border: "1px solid #1e293b",
      background: "#020617",
      color: "#cbd5e1",
      fontSize: "12px",
      lineHeight: 1.7,
    } as React.CSSProperties,
    error: {
      marginTop: "12px",
      padding: "12px",
      borderRadius: "12px",
      border: "1px solid #7f1d1d",
      background: "#450a0a",
      color: "#fecaca",
      fontSize: "14px",
    } as React.CSSProperties,
    resultGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px",
      marginTop: "12px",
    } as React.CSSProperties,
    resultCard: {
      display: "block",
      textDecoration: "none",
      color: "#e2e8f0",
      background: "#020617",
      border: "1px solid #1e293b",
      borderRadius: "12px",
      padding: "8px",
    } as React.CSSProperties,
    resultImg: {
      width: "100%",
      height: "160px",
      objectFit: "cover",
      borderRadius: "8px",
      background: "#0f172a",
    } as React.CSSProperties,
    smallText: {
      color: "#94a3b8",
      fontSize: "13px",
    } as React.CSSProperties,
    divider: {
      marginTop: "16px",
      paddingTop: "16px",
      borderTop: "1px solid #1e293b",
    } as React.CSSProperties,
    footer: {
      marginTop: "20px",
      color: "#64748b",
      fontSize: "12px",
    } as React.CSSProperties,
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Sentinel – Reverse Image Search</h1>
        <p style={styles.subtitle}>
          وێنە دابنێ → SerpAPI Reverse → پاشان Python compare بۆ Threshold
        </p>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Reference Image</div>

            <input
              type="file"
              accept="image/*"
              onChange={onPickFile}
              style={styles.input}
            />

            <div style={{ marginTop: "12px" }}>
              {imageBase64 ? (
                <img src={imageBase64} alt="ref" style={styles.previewImg} />
              ) : (
                <div style={styles.previewBox}>وێنەیەک هەڵبژێرە</div>
              )}
            </div>

            <div style={{ marginTop: "16px" }}>
              <label style={styles.smallText}>Threshold: {threshold}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                style={{ width: "100%", marginTop: "8px" }}
              />

              <div style={{ ...styles.smallText, marginTop: "8px" }}>
                query تەنها بۆ fallback ـە
              </div>

              <input
                placeholder="Optional query (fallback only)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={styles.input}
              />
            </div>

            <button
              onClick={onSearch}
              disabled={!canSearch || loading}
              style={styles.button}
            >
              {loading ? "Searching..." : "Search Similar Images"}
            </button>

            {err ? <div style={styles.error}>{err}</div> : null}

            {meta ? (
              <div style={styles.info}>
                <div>source: {meta?.source}</div>
                <div>totalCandidates: {meta?.totalCandidates}</div>
                <div>compared: {meta?.compared}</div>
                <div>compareFailed: {meta?.compareFailed}</div>
                <div>matched: {meta?.matched}</div>
                <div>tookMs: {meta?.tookMs}</div>
              </div>
            ) : null}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Matched Results</div>

            {results.length === 0 ? (
              <div style={styles.smallText}>
                هیچ ئەنجامێکی تێپەڕبووی Threshold نییە. Threshold کەم بکە یان
                وێنەی ڕوونتر دابنێ.
              </div>
            ) : (
              <div style={styles.resultGrid}>
                {results.map((x) => (
                  <a
                    key={x.url}
                    href={x.url}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.resultCard}
                  >
                    <img src={x.url} alt="" style={styles.resultImg} />
                    <div style={{ marginTop: "8px", fontSize: "12px" }}>
                      score: {x.score.toFixed(2)}
                    </div>
                  </a>
                ))}
              </div>
            )}

            <div style={styles.divider}>
              <div style={styles.sectionTitle}>Top Compared (debug)</div>

              {topResults.length === 0 ? (
                <div style={styles.smallText}>هیچ وێنەیەک compare نەکرا.</div>
              ) : (
                <div style={styles.resultGrid}>
                  {topResults.map((x) => (
                    <a
                      key={x.url}
                      href={x.url}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.resultCard}
                    >
                      <img
                        src={x.url}
                        alt=""
                        style={{ ...styles.resultImg, height: "120px" }}
                      />
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "12px",
                          color: "#94a3b8",
                        }}
                      >
                        score: {x.score.toFixed(2)}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          ئەگەر source = serpapi_bing_reverse_image بێت، ئەنجامەکان بە وێنەی
          Reference ـەوە دێن.
        </div>
      </div>
    </div>
  );
}
