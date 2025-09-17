export async function POST(req: any, res: any) {
  // Example: submit a contact form from homepage
  res.json({ message: "POST received on /", body: req.body });
}

export async function PUT(req: any, res: any) {
  res.json({ message: "PUT received on /" });
}
