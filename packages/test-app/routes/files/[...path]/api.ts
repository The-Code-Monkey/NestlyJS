export async function POST(req: any) {
  return { status: 200, body: { path: req.params.path } };
}
