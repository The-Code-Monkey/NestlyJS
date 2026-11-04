export async function POST(req: any) {
  return { status: 200, body: { slug: req.params.slug } };
}
