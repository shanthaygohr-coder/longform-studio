// ============================================================================
// PinForge — aplicatie pentru Gemini Canvas (un singur fisier React)
// ----------------------------------------------------------------------------
// Selectezi nisa -> apesi "Genereaza" -> primesti 10 pinuri Pinterest:
//   * imagini generate cu NANO BANANA (gemini-2.5-flash-image), verticale 2:3
//   * copy non-generic optimizat pentru CTR maxim (hook + titlu + descriere + alt)
//   * reguli de nisa (Health: listicle/infografic, fara before/after;
//     Finance/SaaS: cheat sheets & comparatii vizuale)
//
// Rulare in Gemini Canvas: lipeste tot fisierul. Cheia API este injectata de
// runtime (apiKey = ""). In afara Canvas, completeaza cheia in campul din UI.
// ============================================================================

import React, { useState, useCallback, useMemo } from "react";
import { Sparkles, Download, Loader2, AlertTriangle, Image as ImageIcon, Wand2, CalendarClock } from "lucide-react";

// ---------------------------------------------------------------------------
// Modele Gemini
// ---------------------------------------------------------------------------
const TEXT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image"; // Nano Banana
const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

// ---------------------------------------------------------------------------
// Definitia niselor + reguli (oglindeste motorul de pe backend)
// ---------------------------------------------------------------------------
const NICHES = {
  HEALTH_FITNESS: {
    label: "Fitness & Sanatate",
    accent: "#16A34A",
    layouts: ["listicle numerotat", "infografic cu iconite"],
    bannedPatterns: "STRICT INTERZIS: imagini de tip inainte/dupa (before/after), comparatii de greutate corporala, body shaming.",
    visualStyle: "ilustratie vectoriala plata, energica, stil infografic curat",
    palette: "verde proaspat, albastru, alb",
    keywordHint: "rutina, slabit sanatos, energie, nutritie",
  },
  PERSONAL_FINANCE: {
    label: "Finante Personale",
    accent: "#1D4ED8",
    layouts: ["cheat sheet pe grila", "comparatie pe 2 coloane", "listicle numerotat"],
    bannedPatterns: "Fara promisiuni de castiguri garantate sau scheme de imbogatire rapida.",
    visualStyle: "infografic financiar modern, vizualizare de date, aspect de incredere",
    palette: "albastru inchis, verde bani, alb",
    keywordHint: "economisire, bugetare, investitii, venit pasiv",
  },
  B2B_SAAS: {
    label: "B2B SaaS",
    accent: "#6D28D9",
    layouts: ["comparatie pe 2 coloane", "cheat sheet pe grila", "listicle numerotat"],
    bannedPatterns: "Fara metrici fabricate sau testimoniale false.",
    visualStyle: "ilustratie de dashboard SaaS curata, isometric, profesional",
    palette: "violet, albastru, gri deschis",
    keywordHint: "productivitate, automatizare, ROI, integrare",
  },
};

// ---------------------------------------------------------------------------
// Helper fetch cu exponential backoff (max ~32s), pentru rate limits
// ---------------------------------------------------------------------------
async function fetchWithBackoff(url, options, maxAttempts = 5) {
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url, options);
    if (res.status === 429 || res.status === 503) {
      if (attempt >= maxAttempts) throw new Error(`API supraincarcat (${res.status}).`);
      const wait = Math.min(1000 * 2 ** (attempt - 1), 32000) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
    }
    return res.json();
  }
}

// ---------------------------------------------------------------------------
// Pas 1: genereaza 10 blueprint-uri distincte (copy + prompt imagine) cu text model
// ---------------------------------------------------------------------------
async function generateBlueprints({ apiKey, niche, brand, keyword }) {
  const n = NICHES[niche];
  const system = `Esti un strateg de continut Pinterest expert in CTR ridicat si copywriting non-generic.
Nisa: ${n.label}. Brand/URL: ${brand || "(neprecizat)"}. Tema/keyword: ${keyword || n.keywordHint}.
Layout-uri permise: ${n.layouts.join(", ")}. ${n.bannedPatterns}

Genereaza EXACT 10 concepte de pin DISTINCTE intre ele (unghiuri, hook-uri, layout-uri si palete diferite),
fiecare optimizat pentru CTR maxim folosind tehnici dovedite: numere, curiosity gap, beneficiu clar, power words.
Evita formularile generice si repetitive. Pentru fiecare concept returneaza:
- "hook": unghiul/ideea pe scurt
- "title": titlu puternic benefit+actiune (max 100 caractere)
- "description": descriere persuasiva (max 480 caractere) cu keyword-ul in PRIMUL paragraf; termina cu "#ad #affiliate"
- "altText": text alternativ descriptiv
- "imagePrompt": prompt vizual DETALIAT pentru un generator de imagini, descriind un design vertical de pin Pinterest
   (2:3), cu titlul scurt randat ca text BOLD sans-serif, minim 30% spatiu gol, layout din lista permisa,
   paleta (${n.palette}), stil (${n.visualStyle}). Mentioneaza ca textul din imagine sa fie scurt si lizibil.
   ${niche === "HEALTH_FITNESS" ? "NU descrie niciodata comparatii inainte/dupa sau corpuri." : ""}`;

  const schema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        hook: { type: "STRING" },
        title: { type: "STRING" },
        description: { type: "STRING" },
        altText: { type: "STRING" },
        imagePrompt: { type: "STRING" },
      },
      required: ["hook", "title", "description", "altText", "imagePrompt"],
    },
  };

  const url = `${API_ROOT}/${TEXT_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: system }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 1.0, // diversitate maxima => non-generic
    },
  };

  const json = await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  let arr = JSON.parse(text);
  if (!Array.isArray(arr)) arr = [];
  return arr.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pas 2: genereaza imaginea unui pin cu Nano Banana (gemini-2.5-flash-image)
// ---------------------------------------------------------------------------
async function generateImage({ apiKey, imagePrompt, brand }) {
  const fullPrompt = `${imagePrompt}

Constrangeri stricte de randare:
- Orientare VERTICALA, raport 2:3 (ca 1000x1500 px), potrivita pentru feed-ul mobil Pinterest.
- Tipografie: fonturi sans-serif GROASE (bold) pentru titlu, foarte lizibile.
- Pastreaza minimum 30% spatiu gol (white space), design aerisit, necontorsionat.
- Adauga discret URL-ul brandului "${brand || "brand.com"}" in partea de jos.
- Calitate inalta, fara watermark, fara text de umplutura aiurea.`;

  const url = `${API_ROOT}/${IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "2:3" },
    },
  };

  const json = await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) throw new Error("Nano Banana nu a returnat imagine.");
  const mime = imgPart.inlineData.mimeType || "image/png";
  return `data:${mime};base64,${imgPart.inlineData.data}`;
}

// ---------------------------------------------------------------------------
// Componenta principala
// ---------------------------------------------------------------------------
export default function App() {
  // In Gemini Canvas cheia este injectata automat -> lasa "".
  const [apiKey, setApiKey] = useState("");
  const [niche, setNiche] = useState("HEALTH_FITNESS");
  const [brand, setBrand] = useState("");
  const [keyword, setKeyword] = useState("");
  const [pins, setPins] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // ---- Conectarea cu Autopilotul (backend PinForge) ----
  const [backendUrl, setBackendUrl] = useState("http://localhost:3000");
  const [accountId, setAccountId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [destLink, setDestLink] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");

  const accent = NICHES[niche].accent;
  const readyPins = useMemo(() => pins.filter((p) => p.image), [pins]);

  const handleGenerate = useCallback(async () => {
    setError("");
    setBusy(true);
    setPins([]);
    setProgress({ done: 0, total: 10 });
    try {
      // 1) Blueprint-urile (copy + prompturi)
      const blueprints = await generateBlueprints({ apiKey, niche, brand, keyword });
      if (!blueprints.length) throw new Error("Nu am primit concepte de pin. Reincearca.");

      // Initializeaza cardurile in starea "se genereaza imaginea"
      setPins(blueprints.map((b, i) => ({ id: i, ...b, image: null, imgError: null })));
      setProgress({ done: 0, total: blueprints.length });

      // 2) Genereaza imaginile in paralel; actualizeaza fiecare card cand e gata
      let completed = 0;
      await Promise.all(
        blueprints.map(async (b, i) => {
          try {
            const image = await generateImage({ apiKey, imagePrompt: b.imagePrompt, brand });
            setPins((prev) => prev.map((p) => (p.id === i ? { ...p, image } : p)));
          } catch (e) {
            setPins((prev) => prev.map((p) => (p.id === i ? { ...p, imgError: e.message } : p)));
          } finally {
            completed++;
            setProgress({ done: completed, total: blueprints.length });
          }
        })
      );
    } catch (e) {
      setError(e.message || "Eroare necunoscuta.");
    } finally {
      setBusy(false);
    }
  }, [apiKey, niche, brand, keyword]);

  const downloadPin = useCallback((pin) => {
    if (!pin.image) return;
    const a = document.createElement("a");
    a.href = pin.image;
    a.download = `pin-${pin.id + 1}.png`;
    a.click();
  }, []);

  // Trimite pinurile generate catre Autopilot, care le programeaza pe Pinterest.
  const scheduleToPinterest = useCallback(async () => {
    setScheduleMsg("");
    if (!accountId || !boardId) {
      setScheduleMsg("Completeaza Account ID si Board ID (le obtii din backend dupa conectarea contului).");
      return;
    }
    if (readyPins.length === 0) {
      setScheduleMsg("Nu exista pinuri cu imagine generata.");
      return;
    }
    setScheduling(true);
    try {
      const link = destLink || (brand ? `https://${brand.replace(/^https?:\/\//, "")}` : "");
      const payload = {
        accountId,
        intervalMinutes: 90,
        maxPerDay: 8,
        pins: readyPins.map((p) => ({
          boardId,
          title: p.title,
          description: p.description,
          altText: p.altText,
          link,
          imageBase64: p.image, // data URL; backend-ul elimina prefixul
          contentClass: "OFFER",
          isCommercial: true,
        })),
      };
      const res = await fetch(`${backendUrl.replace(/\/$/, "")}/campaigns/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Backend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      setScheduleMsg(`Programate ${data.count} pinuri pe Pinterest. Autopilotul le va publica esalonat.`);
    } catch (e) {
      setScheduleMsg(`Eroare la programare: ${e.message}`);
    } finally {
      setScheduling(false);
    }
  }, [accountId, boardId, destLink, brand, backendUrl, readyPins]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="grid place-items-center w-10 h-10 rounded-xl" style={{ background: accent }}>
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">PinForge</h1>
            <p className="text-xs text-slate-500">10 pinuri Pinterest optimizate pentru CTR · Nano Banana</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Panou de control */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold mb-2">Nisa</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.entries(NICHES).map(([key, n]) => (
                  <button
                    key={key}
                    onClick={() => setNiche(key)}
                    className={`rounded-xl border-2 px-4 py-3 text-left transition ${
                      niche === key ? "border-current shadow-sm" : "border-slate-200 hover:border-slate-300"
                    }`}
                    style={{ color: niche === key ? n.accent : undefined }}
                  >
                    <div className="font-bold text-slate-900">{n.label}</div>
                    <div className="text-xs text-slate-500 mt-1">{n.layouts[0]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Brand / URL (optional)</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="ex: myfitsite.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": accent }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Keyword / Oferta (optional)</label>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={NICHES[niche].keywordHint}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": accent }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Cheie API Gemini (lasa gol in Canvas)</label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="auto in Canvas"
                type="password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": accent }}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-white disabled:opacity-50 transition active:scale-95"
              style={{ background: accent }}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
              {busy ? "Se genereaza..." : "Genereaza 10 pinuri"}
            </button>
            {busy && progress.total > 0 && (
              <span className="text-sm text-slate-500">
                Imagini: {progress.done}/{progress.total}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* Galeria de pinuri */}
        {pins.length > 0 && (
          <section className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {pins.map((pin) => (
              <article key={pin.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                {/* Imagine verticala 2:3 */}
                <div className="relative w-full bg-slate-100" style={{ aspectRatio: "2 / 3" }}>
                  {pin.image ? (
                    <img src={pin.image} alt={pin.altText} className="w-full h-full object-cover" />
                  ) : pin.imgError ? (
                    <div className="absolute inset-0 grid place-items-center text-center p-3 text-xs text-red-500">
                      <div>
                        <AlertTriangle className="w-6 h-6 mx-auto mb-1" />
                        Imagine esuata
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-slate-400">
                      <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                  )}
                  {pin.image && (
                    <button
                      onClick={() => downloadPin(pin)}
                      className="absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-lg bg-white/90 hover:bg-white shadow"
                      title="Descarca"
                    >
                      <Download className="w-4 h-4 text-slate-700" />
                    </button>
                  )}
                </div>
                {/* Copy */}
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <h3 className="text-sm font-bold leading-snug line-clamp-2">{pin.title}</h3>
                  <p className="text-[11px] text-slate-500 line-clamp-3">{pin.description}</p>
                  <span className="mt-auto pt-2 text-[10px] uppercase tracking-wide font-semibold" style={{ color: accent }}>
                    {pin.hook}
                  </span>
                </div>
              </article>
            ))}
          </section>
        )}

        {/* Panou: Programeaza pe Pinterest (conecteaza Studioul cu Autopilotul) */}
        {readyPins.length > 0 && (
          <section className="mt-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-extrabold mb-1">Programeaza pe Pinterest</h2>
            <p className="text-sm text-slate-500 mb-4">
              Trimite cele {readyPins.length} pinuri catre Autopilot (backend PinForge). Le va publica esalonat,
              cu pacing pentru rate-limit si gate FTC.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">URL Backend (Autopilot)</label>
                <input
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": accent }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Link destinatie (bridge page / brand)</label>
                <input
                  value={destLink}
                  onChange={(e) => setDestLink(e.target.value)}
                  placeholder="https://brand.com/go/oferta"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": accent }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Account ID</label>
                <input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="din /pinterest/callback"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": accent }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Board ID</label>
                <input
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  placeholder="din /pinterest/:accountId/boards"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": accent }}
                />
              </div>
            </div>
            <div className="mt-5 flex items-center gap-4">
              <button
                onClick={scheduleToPinterest}
                disabled={scheduling}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-white disabled:opacity-50 transition active:scale-95"
                style={{ background: accent }}
              >
                {scheduling ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarClock className="w-5 h-5" />}
                {scheduling ? "Se programeaza..." : `Programeaza ${readyPins.length} pinuri`}
              </button>
              {scheduleMsg && <span className="text-sm text-slate-600">{scheduleMsg}</span>}
            </div>
          </section>
        )}

        {pins.length === 0 && !busy && (
          <div className="mt-16 text-center text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-3" />
            <p>Alege o nisa si apasa „Genereaza 10 pinuri".</p>
          </div>
        )}
      </main>
    </div>
  );
}
