/**
 * Supervises development child processes. Callers supply a key, a child
 * factory, and a protocol adapter that maps child messages to response
 * completions. One module owns the child map, pending queues, forking,
 * message flushing, and crash recovery so page and API paths behave alike.
 */

export interface ChildLike {
  send(message: unknown): void;
  kill(): void;
  on(event: "message", listener: (message: any) => void): void;
  on(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void;
}

export interface SupervisorProtocol<Response, Reply> {
  /** Creates a child for the key. Only called when no child exists. */
  fork(key: string): ChildLike;
  /** Maps a child message to a reply, or null when the message is unrelated. */
  interpret(key: string, message: unknown): Reply | null;
  /** Completes one queued response with the reply from the child. */
  complete(response: Response, reply: Reply): void;
  /** Fails one queued response when its child exits. */
  fail(response: Response, reason: string): void;
  /** Body text used by `fail` when a child exits. */
  failure: string;
  /** Optional request id carried by a message, used to correlate replies. */
  requestId?(message: unknown): string | number | undefined;
  /** Optional request id carried by a reply. */
  replyId?(reply: Reply): string | number | undefined;
  /** Optional hook for logging or invalidation when a child exits. */
  onExit?(
    key: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void;
}

export interface Supervisor<Response> {
  /**
   * Queues a response behind the key's child, forking one when needed, then
   * sends the request message.
   */
  request(key: string, message: unknown, response: Response): void;
  /** Kills the key's child so the next request forks fresh code. */
  kill(key: string): void;
  /** Kills every supervised child. */
  killAll(): void;
}

interface PendingResponse<Response> {
  id: string | number | undefined;
  response: Response;
}

interface ChildEntry<Response> {
  child: ChildLike;
  pending: PendingResponse<Response>[];
}

export function createSupervisor<Response, Reply>(
  protocol: SupervisorProtocol<Response, Reply>
): Supervisor<Response> {
  const children = new Map<string, ChildEntry<Response>>();

  function ensure(key: string): ChildEntry<Response> {
    const existing = children.get(key);
    if (existing) return existing;

    const child = protocol.fork(key);
    const entry: ChildEntry<Response> = { child, pending: [] };
    children.set(key, entry);

    child.on("message", (message) => {
      const reply = protocol.interpret(key, message);
      if (reply === null) return;

      const replyId = protocol.replyId?.(reply);
      if (replyId !== undefined) {
        const index = entry.pending.findIndex(
          (pending) => pending.id === replyId
        );
        if (index === -1) return;

        const [pending] = entry.pending.splice(index, 1);
        protocol.complete(pending.response, reply);
        return;
      }

      const pending = entry.pending;
      entry.pending = [];
      for (const pendingResponse of pending) {
        protocol.complete(pendingResponse.response, reply);
      }
    });

    child.on("exit", (code, signal) => {
      protocol.onExit?.(key, code, signal);

      const pending = entry.pending;
      entry.pending = [];
      for (const pendingResponse of pending) {
        protocol.fail(pendingResponse.response, protocol.failure);
      }

      if (children.get(key) === entry) children.delete(key);
    });

    return entry;
  }

  function kill(key: string) {
    const entry = children.get(key);
    if (!entry) return;

    children.delete(key);
    entry.child.kill();
  }

  return {
    request(key, message, response) {
      const entry = ensure(key);
      entry.pending.push({
        id: protocol.requestId?.(message),
        response,
      });
      entry.child.send(message);
    },
    kill,
    killAll() {
      for (const key of [...children.keys()]) kill(key);
    },
  };
}
