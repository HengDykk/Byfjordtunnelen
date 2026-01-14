export async function onRequest(context) {
  const nowIso = new Date().toISOString();

  // Offisiell DATEX feed for trafikkmeldinger (GetSituation)
  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata";

  const res = await fetch(upstream, {
    headers: {
      "Accept": "application/xml",
      "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)"
    },
    cf: { cacheTtl: 0, cacheEverything: false }
  });

  const xml = await res.text();

  // Hvis upstream feiler, gi feil videre
  if (!res.ok) {
    return new Response(xml, {
      status: res.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // Parse XML i Workers runtime
  let doc;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch (e) {
    return new Response(JSON.stringify({ updated: nowIso, error: "Kunne ikke parse XML" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // Hent ut situasjoner grovt og enkelt
  const situations = Array.from(doc.querySelectorAll("situationRecord"));

  const messages = situations
    .map((sr) => {
      const title =
        sr.querySelector("situationRecordCreationReference")?.textContent?.trim() ||
        sr.querySelector("probabilityOfOccurrence")?.textContent?.trim() ||
        "Trafikkmelding";

      const text =
        sr.querySelector("generalPublicComment comment")?.textContent?.trim() ||
        sr.querySelector("comment comment")?.textContent?.trim() ||
        sr.querySelector("causeDescription")?.textContent?.trim() ||
        "";

      const severity =
        sr.querySelector("severity")?.textContent?.trim() ||
        sr.querySelector("impactOnTraffic")?.textContent?.trim() ||
        "INFO";

      return { title, text, severity };
    })
    // Fjern tomme
    .filter((m) => (m.title && m.title.length) || (m.text && m.text.length))
    // Kutt litt for stabil visning
    .slice(0, 50);

  // Enkel tunnelstatus heuristikk
  // Hvis noen meldinger nevner Byfjordtunnelen og inneholder stengt, closure, closed
  const byfjordHit = messages.find((m) =>
    (m.title + " " + m.text).toLowerCase().includes("byfjord")
  );
  const byfjordClosed = byfjordHit
    ? /stengt|closed|closure|tunnel closed/i.test(byfjordHit.title + " " + byfjordHit.text)
    : false;

  const payload = {
    updated: nowIso,
    stavanger: { messages },
    byfjord: {
      status: byfjordClosed ? "STENGT" : "ÅPEN",
      reason: byfjordHit ? byfjordHit.text || byfjordHit.title : "",
      updated: nowIso,
      cameras: {
        // Kamera må vi legge på i neste steg via GetCCTVSiteTable, men la feltene finnes
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
