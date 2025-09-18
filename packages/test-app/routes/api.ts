/**
 * HTTP POST handler for the root path that echoes the request body.
 *
 * Responds with a JSON object: `{ message: "POST received on /", body: req.body }`.
 */
export async function POST(req: any, res: any) {
  // Example: submit a contact form from homepage
  res.json({ message: "POST received on /", body: req.body });
}

/**
 * HTTP PUT handler for the root path that responds with a JSON confirmation message.
 *
 * Sends a JSON object `{ message: "PUT received on /" }`.
 */
export async function PUT(req: any, res: any) {
  res.json({ message: "PUT received on /" });
}
