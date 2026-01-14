export async function onRequest(context) {
  const env = context.env || {};
  const user = env.DATEX_USER;
  const pass = env.DATEX_PASS;

  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata";

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
    return new Response(
      JSON.stringify({ updated: new Date().toISOString(), error: `Upstream ${res.status}`, raw: xml.slice(0, 2000) }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  const nowIso = new Date().toISOString();

  // Parse DATEX XML
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  // Finn alle situationRecord
  const records = Array.from(doc.querySelectorAll("situationRecord"));

  const messages = records
    .map((sr) => {
      const get = (sel) => sr.querySelector(sel)?.textContent?.trim() || "";

      // DATEX: kommentar for publikum ligger ofte her
      const text =
        get("generalPublicComment comment") ||
        get("comment comment") ||
        get("causeDescription") ||
        "";

      const title =
        get("situationRecordType") ||
        get("situationRecordCreationReference") ||
        (text ? text.split(".")[0].slice(0, 80) : "Trafikkmelding");

      const severity = get("severity") || get("impactOnTraffic") || "INFO";

      // Forsøk å hente tidspunkt
      const created = get("situationRecordCreationTime") || get("versionTime") || "";

      return {
        title,
        text,
        severity,
        time: created
      };
    })
    .filter((m) => m.title || m.text)
    .slice(0, 80);

  // Enkel "Byfjord" heuristikk for status
  const byText = (m) => (m.title + " " + m.text).toLowerCase();
  const byfjordRelated = messages.find((m) => byText(m).includes("byfjord"));
  const byfjordClosed = byfjordRelated ? /stengt|closed|closure/i.test(byText(byfjordRelated)) : false;

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

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
