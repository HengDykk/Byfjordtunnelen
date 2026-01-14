export async function onRequest(context) {
  const env = context.env || {};
  const user = env.DATEX_USER;
  const pass = env.DATEX_PASS;

  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata";

  try {
    const headers = {
      "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)"
    };

    if (user && pass) {
      headers.Authorization = "Basic " + btoa(`${user}:${pass}`);
    }

    const res = await fetch(upstream, {
      method: "GET",
      headers,
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    const xml = await res.text();

    if (!res.ok) {
      return json(
        { updated: new Date().toISOString(), error: `Upstream ${res.status}`, raw: xml.slice(0, 2000) },
        502
      );
    }

    const messages = extractMessagesFromDatex(xml);

    const nowIso = new Date().toISOString();
    const byfjordRelated = messages.find((m) =>
      (m.title + " " + m.text).toLowerCase().includes("byfjord")
    );
    const byfjordClosed = byfjordRelated
      ? /stengt|closed|closure/i.test((byfjordRelated.title + " " + byfjordRelated.text).toLowerCase())
      : false;

    const payload = {
      updated: nowIso,
      stavanger: { messages },
      byfjord: {
        status: byfjordClosed ? "STENGT" : "ÅPEN",
        reason: byfjordRelated ? (byfjordRelated.text || byfjordRelated.title) : "",
        updated: nowIso,
        cameras: {
          retningByfjordtunnelen: { image: "", updated: nowIso },
          retningStavanger: { image: "", updated: nowIso }
        }
      }
    };

    return json(payload, 200);
  } catch (e) {
    return json(
      {
        updated: new Date().toISOString(),
        error: "Worker exception",
        message: String(e && e.message ? e.message : e)
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
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/**
 * Super robust "best effort" DATEX extractor uten DOMParser.
 * Henter ut tekstlige meldinger nok til wallboard.
 */
function extractMessagesFromDatex(xml) {
  // 1) Finn alle situationRecord blokker
  const records = xml.match(/<[^:>]*:?situationRecord\b[\s\S]*?<\/[^:>]*:?situationRecord>/g) || [];

  const takeFirst = (s) => (s ? s.trim() : "");

  const decodeXml = (s) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const pick = (block, tag) => {
    // matcher både <tag> og <ns:tag>
    const re = new RegExp(`<[^:>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`, "i");
    const m = block.match(re);
    return m ? decodeXml(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
  };

  const messages = [];

  for (const r of records) {
    const comment = pick(r, "comment");
    const severity = pick(r, "severity") || pick(r, "impactOnTraffic") || "INFO";
    const created = pick(r, "situationRecordCreationTime") || pick(r, "versionTime") || "";

    // Lag en title som er stabil og kort
    const title = comment ? comment.split(".")[0].slice(0, 90) : "Trafikkmelding";
    const text = comment || "";

    if (!title && !text) continue;

    messages.push({
      title,
      text,
      severity: severity || "INFO",
      time: created
    });

    if (messages.length >= 80) break;
  }

  return messages;
}
