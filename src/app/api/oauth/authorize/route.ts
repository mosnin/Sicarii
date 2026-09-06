export async function GET(req: Request) {
  const target = new URL("/oauth/authorize", req.url);
  target.search = new URL(req.url).search;
  return Response.redirect(target, 308);
}
