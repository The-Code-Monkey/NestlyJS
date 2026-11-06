import type { IncomingMessage } from "http";

export const MAX_BODY_BYTES = 1_000_000;

export class RequestBodyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

/**
 * Reads and parses an API request body. JSON content types parse to a value;
 * other content types stay as text. Empty bodies return undefined.
 */
export async function readRequestBody(
  req: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RequestBodyError(413, "Payload too large");
    }
    chunks.push(buffer);
  }

  if (size === 0) return undefined;

  const text = Buffer.concat(chunks).toString("utf8");
  const contentType = String(req.headers["content-type"] || "");

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new RequestBodyError(400, "Invalid JSON");
    }
  }

  return text;
}
