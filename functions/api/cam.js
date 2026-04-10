// functions/api/cam.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").toLowerCase();

  const map = {
    byfjord_nord: "https://kamera.atlas.vegvesen.no/api/images/1129027_2",
    byfjord_sor: "https://kamera.atlas.vegvesen.no/api/images/1129027_1",
    eiganes: "https://kamera.atlas.vegvesen.no/api/images/1129038_2",
    hundvag_sandnes: "https://kamera.atlas.vegvesen.no/api/images/3001023_1",
    nord: env.CAM_NORD_URL,
    sor: env.CAM_SOR_URL
  };

  const upstream = map[id];
  if (!upstream) {
    return new Response("Ukjent kamera.", { status: 400 });
  }

  const res = await fetch(upstream, {
    method: "GET",
    headers: {
      "User-Agent": "Byfjordtunnelen/1.0 (Cloudflare Pages)",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 15
    }
  });

  if (!res.ok) {
    return new Response(`Kamerakilde feilet: ${res.status}`, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const body = await res.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=15",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
