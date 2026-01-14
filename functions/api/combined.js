export async function onRequest(context) {
  const url = new URL(context.request.url);
  const region = url.searchParams.get("region") || "stavanger";

  const upstreamUrl =
    "https://tavle.atlas.vegvesen.no/api/combined?region=" +
    encodeURIComponent(region);

  const res = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)",
      "Referer": "https://www.vegvesen.no/"
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  });

  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
