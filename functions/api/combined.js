export async function onRequest(context) {
  const url = new URL(context.request.url);
  const region = url.searchParams.get("region") || "stavanger";

  const env = context.env || {};
  const user = env.DATEX_USER;
  const pass = env.DATEX_PASS;
  const token = env.DATEX_TOKEN;

  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata";

  const headers = {
    "Accept": "application/xml",
    "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (user && pass) {
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
      `Upstream feilet. Status ${res.status}\n\n${xml}`,
      {
        status: res.status,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  const nowIso = new Date().toISOString();

  let doc;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return new Response(JSON.stringify({ updated: nowIso, error: "Kunne ikke parse XML" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const situations = Array.from(doc.querySelectorAll("situationRecord"));

  const messages = situations
    .map((sr) => {
      const title =
        sr.querySelector("generalPublicComment comment")?.textContent?.trim() ||
        sr.querySelector("comment comment")?.textContent?.trim() ||
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
    .filter((m) => (m.title && m.title.length) || (m.text && m.text.length))
    .slice(0, 50);

  const payload = {
    updated: nowIso,
    stavanger: { messages },
    byfjord: {
      status: "ÅPEN",
      reason: "",
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
