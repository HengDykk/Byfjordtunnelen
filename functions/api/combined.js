// functions/api/combined.js

export async function onRequest(context) {
  const env = context.env || {};
  const user = env.DATEX_USER;
  const pass = env.DATEX_PASS;

  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata";

  try {
    const headers = {
      "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)",
    };

    if (user && pass) {
      headers.Authorization = "Basic " + btoa(`${user}:${pass}`);
    }

    const res = await fetch(upstream, {
      method: "GET",
      headers,
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    const xml = await res.text();

    if (!res.ok) {
      return json(
        {
          updated: new Date().toISOString(),
          error: `Upstream ${res.status}`,
          raw: xml.slice(0, 2000),
        },
        502
      );
    }

    const rawMessages = extractMessagesFromDatex(xml);

    // Dedup på tekst (robust mot DATEX duplikater)
    const seen = new Set();
    const messagesClean = [];
    for (const m of rawMessages) {
      const key = ((m.text || m.title) + "").trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      messagesClean.push(m);
    }

    // Lokal filtrering, juster listen hvis du vil være strengere eller bredere
    const keywords = [
      "byfjord",
      "byfjordtunnelen",
      "rennesøy",
      "e39",
      "stavanger",
      "sokn",
      "randaberg",
      "tunnel",
      "tunnelen",
      "eiganes",
      "tasta",
      "madla",
    ];

    let localOnly = messagesClean.filter((m) => {
      const t = (m.title + " " + m.text).toLowerCase();
      return keywords.some((k) => t.includes(k));
    });

    // Fallback hvis filteret blir tomt
    if (!localOnly.length) localOnly = messagesClean.slice(0, 15);

    const nowIso = new Date().toISOString();

    // Byfjord status heuristikk
    const byfjordMsg = localOnly.find((m) =>
      (m.title + " " + m.text).toLowerCase().includes("byfjord")
    );
    const byTxt = byfjordMsg ? (byfjordMsg.title + " " + byfjordMsg.text).toLowerCase() : "";

    let byStatus = "ÅPEN";
    if (byfjordMsg && /stengt|tunnel stengt|closed|closure/.test(byTxt)) byStatus = "STENGT";
    else if (byfjordMsg && /kolonne|stans|omkjøring|lysregulering|dirigering|redusert/.test(byTxt)) byStatus = "AVVIK";

    const payload = {
      updated: nowIso,
      stavanger: { messages: localOnly },
      byfjord: {
        status: byStatus,
        reason: byfjordMsg ? (byfjordMsg.text || byfjordMsg.title) : "",
        updated: nowIso,
        cameras: {
          retningByfjordtunnelen: { image: "", updated: nowIso },
          retningStavanger: { image: "", updated: nowIso },
        },
      },
    };

    return json(payload, 200);
  } catch (e) {
    return json(
      {
        updated: new Date().toISOString(),
        error: "Worker exception",
        message: String(e && e.message ? e.message : e),
      },
      500
    );
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Robust DATEX extractor uten DOMParser
 * Tar ut situationRecord blokker og henter første relevante tekst
 */
function extractMessagesFromDatex(xml) {
  const records =
    xml.match(/<[^:>]*:?situationRecord\b[\s\S]*?<\/[^:>]*:?situationRecord>/g) || [];

  const decodeXml = (s) =>
    (s || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const stripTags = (s) => (s || "").replace(/<[^>]+>/g, " ");

  const pick = (block, tag) => {
    const re = new RegExp(`<[^:>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`, "i");
    const m = block.match(re);
    if (!m) return "";
    const val = decodeXml(stripTags(m[1])).replace(/\s+/g, " ").trim();
    return val;
  };

  const messages = [];

  for (const r of records) {
    const commentRaw = pick(r, "comment");
    const comment = (commentRaw || "").replace(/\|/g, "\n").trim();

    const severity = pick(r, "severity") || pick(r, "impactOnTraffic") || "INFO";
    const created = pick(r, "situationRecordCreationTime") || pick(r, "versionTime") || "";

    const title = comment ? comment.split(".")[0].slice(0, 90) : "Trafikkmelding";
    const text = comment || "";

    if (!title && !text) continue;

    messages.push({
      title,
      text,
      severity: severity || "INFO",
      time: created,
    });

    if (messages.length >= 80) break;
  }

  return messages;
}
