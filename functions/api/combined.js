export async function onRequest(context) {
  const url = new URL(context.request.url);
  const region = url.searchParams.get("region") || "stavanger";

  const upstream = `https://tavle.atlas.vegvesen.no/api/combined?region=${encodeURIComponent(region)}`;

  const res = await fetch(upstream, {
    headers: {
      "User-Agent": "Byfjordtunnelen Wallboard",
      "Accept": "application/json"
    }
  });

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
