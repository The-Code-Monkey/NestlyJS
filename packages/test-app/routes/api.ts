export async function POST(req: any) {
  return {
    status: 200,
    body: { message: "POST received on /", body: req.body },
  };
}

export async function PUT() {
  return { status: 200, body: { message: "PUT received on /" } };
}
