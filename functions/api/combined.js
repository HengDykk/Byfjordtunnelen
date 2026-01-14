export async function onRequest(context) {
  const env = context.env || {};
  const user = env.DATEX_USER;
  const pass = env.DATEX_PASS;
  const token = env.DATEX_TOKEN;

  // 🔴 SETT DENNE
  const subscriptionId = env.DATEX_SUBSCRIPTION_ID; // må settes i Pages settings

  if (!subscriptionId) {
    return new Response("Manglende DATEX_SUBSCRIPTION_ID", { status: 500 });
  }

  const upstream =
    "https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata" +
    "?subscriptionId=" + encodeURIComponent(subscriptionId);

  const headers = {
    "Accept": "application/xml",
    "Content-Type": "application/xml",
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

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.ok
        ? "application/xml; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
