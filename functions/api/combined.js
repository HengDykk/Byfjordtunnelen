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
        { updated: new Date().toISOString(), error: `Upstream ${res.status}`, raw: xml.slice(0, 2000) },
        502
      );
    }

    const doc = new DOMParser().parseFromString(xml, "application/xml");

    // Hvis parseren feiler, får du ofte <parsererror>
    const parserErrors = doc.getElementsByTagName("parsererror");
    if (parserErrors && parserErrors.length) {
      return json(
        { updated: new Date().toISOString(), error: "XML parsererror", raw: parserErrors[0].textContent?.slice(0, 2000) || "" },
        502
      );
    }

    // Namespaces gjør querySelector vanskelig. Bruk tagName uten namespace.
    const records = Array.from(doc.getElementsByTagName("situationRecord"));

    const pickText = (node, tagNames) => {
      for (const name of tagNames) {
        const els = node.getElementsByTagName(name);
        if (els && els.length) {
          const t = (els[0].textContent || "").trim();
          if (t) return t;
        }
      }
      return "";
    };

    const messages = records
      .map((sr) => {
        // DATEX: kommentartekst ligger ofte i <comment> under <generalPublicComment> eller andre steder.
        const text =
          pickText(sr, ["comment", "causeDescription", "description"]) || "";

        const severity =
          pickText(sr, ["severity", "impactOnTraffic"]) || "INFO";

        const time =
          pickText(sr, ["situationRecordCreationTime", "versionTime"]) || "";

        const title = text ? text.split(".")[0].slice(0, 80) : "Trafikkmelding";

        return { title, text, severity, time };
      })
      .filter((m) => m.title || m.text)
      .slice(0, 80);

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
