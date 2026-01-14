export async function onRequest(context) {
  const env = context.env || {};
  const user = env.DATEX_USER;
  const pass = env.DATEX_PASS;

  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata";

  const headers = {
    // Ikke tving format. La serveren velge.
    "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)",
  };

  // NPRA spec: HTTP GET er sikret med Basic Authentication. :contentReference[oaicite:1]{index=1}
  if (user && pass) {
    headers.Authorization = "Basic " + btoa(`${user}:${pass}`);
  }

  const res = await fetch(upstream, {
    method: "GET",
    headers,
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  const body = await res.text();

  // Returner alltid diagnostikk som JSON så du ser *hvorfor* det feiler
  return new Response(
    JSON.stringify(
      {
        upstream,
        upstreamStatus: res.status,
        upstreamContentType: res.headers.get("content-type"),
        // NB: Ikke legg auth i output
        body: body.slice(0, 5000), // kutt for å unngå gigantrespons
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
