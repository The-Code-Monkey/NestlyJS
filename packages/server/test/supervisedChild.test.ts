import { describe, it, expect, vi } from "vitest";
import {
  createSupervisor,
  type ChildLike,
  type SupervisorProtocol,
} from "../src/supervisedChild";

interface FakeChild extends ChildLike {
  sent: unknown[];
  kill: ReturnType<typeof vi.fn>;
  emitMessage(message: unknown): void;
  emitExit(
    code?: number | null,
    signal?: NodeJS.Signals | null
  ): void;
}

function fakeChild(): FakeChild {
  let onMessage: (message: any) => void = () => {};
  let onExit: (code: number | null, signal: NodeJS.Signals | null) => void =
    () => {};

  return {
    sent: [],
    kill: vi.fn(),
    send(message: unknown) {
      this.sent.push(message);
    },
    on(event: string, listener: any) {
      if (event === "message") onMessage = listener;
      else onExit = listener;
    },
    emitMessage(message: unknown) {
      onMessage(message);
    },
    emitExit(code = 0, signal = null) {
      onExit(code, signal);
    },
  };
}

interface Response {
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
}

function harness(withExitHook = true) {
  const children: FakeChild[] = [];
  const onExit = vi.fn();

  const protocol: SupervisorProtocol<Response, string> = {
    fork: () => {
      const child = fakeChild();
      children.push(child);
      return child;
    },
    interpret: (_key, message: any) =>
      message?.type === "done" ? message.value : null,
    complete: (response, reply) => response.complete(reply),
    fail: (response, reason) => response.fail(reason),
    failure: "child crashed",
    ...(withExitHook ? { onExit } : {}),
  };

  return {
    supervisor: createSupervisor(protocol),
    children,
    onExit,
    response(): Response {
      return { complete: vi.fn(), fail: vi.fn() };
    },
  };
}

function idHarness() {
  const children: FakeChild[] = [];

  const protocol: SupervisorProtocol<
    Response,
    { id: string; value: string }
  > = {
    fork: () => {
      const child = fakeChild();
      children.push(child);
      return child;
    },
    interpret: (_key, message: any) =>
      message?.type === "done"
        ? { id: message.id, value: message.value }
        : null,
    complete: (response, reply) => response.complete(reply),
    fail: (response, reason) => response.fail(reason),
    failure: "child crashed",
    requestId: (message: any) => message?.id,
    replyId: (reply) => reply.id,
  };

  return {
    supervisor: createSupervisor(protocol),
    children,
    response(): Response {
      return { complete: vi.fn(), fail: vi.fn() };
    },
  };
}

describe("createSupervisor", () => {
  it("forks one child per key and reuses it", () => {
    const h = harness();
    const first = h.response();
    const second = h.response();

    h.supervisor.request("page:/", { type: "render" }, first);
    h.supervisor.request("page:/", { type: "render" }, second);

    expect(h.children).toHaveLength(1);
    expect(h.children[0].sent).toEqual([
      { type: "render" },
      { type: "render" },
    ]);
  });

  it("queues concurrent requests and completes all responses on one message", () => {
    const h = harness();
    const responses = [h.response(), h.response(), h.response()];

    for (const response of responses) {
      h.supervisor.request("page:/", { type: "render" }, response);
    }

    h.children[0].emitMessage({ type: "done", value: "html" });

    for (const response of responses) {
      expect(response.complete).toHaveBeenCalledWith("html");
    }

    h.children[0].emitMessage({ type: "done", value: "again" });
    for (const response of responses) {
      expect(response.complete).toHaveBeenCalledTimes(1);
    }
  });

  it("correlates replies with request ids", () => {
    const h = idHarness();
    const first = h.response();
    const second = h.response();

    h.supervisor.request("api:/", { id: "a" }, first);
    h.supervisor.request("api:/", { id: "b" }, second);

    h.children[0].emitMessage({ type: "done", id: "b", value: "second" });

    expect(second.complete).toHaveBeenCalledWith({
      id: "b",
      value: "second",
    });
    expect(first.complete).not.toHaveBeenCalled();

    h.children[0].emitMessage({ type: "done", id: "a", value: "first" });

    expect(first.complete).toHaveBeenCalledWith({
      id: "a",
      value: "first",
    });
  });

  it("ignores a reply with an unknown request id", () => {
    const h = idHarness();
    const response = h.response();

    h.supervisor.request("api:/", { id: "a" }, response);
    h.children[0].emitMessage({ type: "done", id: "missing", value: "no" });

    expect(response.complete).not.toHaveBeenCalled();

    h.children[0].emitMessage({ type: "done", id: "a", value: "yes" });
    expect(response.complete).toHaveBeenCalledWith({ id: "a", value: "yes" });
  });

  it("ignores unrelated messages", () => {
    const h = harness();
    const response = h.response();

    h.supervisor.request("page:/", { type: "render" }, response);
    h.children[0].emitMessage({ type: "ready" });

    expect(response.complete).not.toHaveBeenCalled();
    expect(response.fail).not.toHaveBeenCalled();
  });

  it("fails pending responses when the child exits and forks again later", () => {
    const h = harness();
    const first = h.response();
    h.supervisor.request("page:/", { type: "render" }, first);

    h.children[0].emitExit(1, "SIGTERM");

    expect(first.fail).toHaveBeenCalledWith("child crashed");
    expect(h.onExit).toHaveBeenCalledWith("page:/", 1, "SIGTERM");

    const second = h.response();
    h.supervisor.request("page:/", { type: "render" }, second);

    expect(h.children).toHaveLength(2);
    expect(h.children[1].sent).toEqual([{ type: "render" }]);
  });

  it("does not let a replaced child's exit affect the new child", () => {
    const h = harness();
    const first = h.response();
    h.supervisor.request("page:/", { type: "render" }, first);

    h.supervisor.kill("page:/");
    const second = h.response();
    h.supervisor.request("page:/", { type: "render" }, second);

    h.children[0].emitExit(0, null);

    expect(first.fail).toHaveBeenCalledWith("child crashed");
    expect(second.fail).not.toHaveBeenCalled();

    h.children[1].emitMessage({ type: "done", value: "new html" });
    expect(second.complete).toHaveBeenCalledWith("new html");
  });

  it("kills a child so the next request forks fresh", () => {
    const h = harness();
    h.supervisor.request("page:/", { type: "render" }, h.response());

    h.supervisor.kill("page:/");

    expect(h.children[0].kill).toHaveBeenCalled();

    h.supervisor.request("page:/", { type: "render" }, h.response());
    expect(h.children).toHaveLength(2);
  });

  it("ignores a kill for a key without a child", () => {
    const h = harness();

    expect(() => h.supervisor.kill("missing")).not.toThrow();
    expect(h.children).toHaveLength(0);
  });

  it("kills every child", () => {
    const h = harness();
    h.supervisor.request("page:/", { type: "render" }, h.response());
    h.supervisor.request("page:/about", { type: "render" }, h.response());

    h.supervisor.killAll();

    expect(h.children[0].kill).toHaveBeenCalled();
    expect(h.children[1].kill).toHaveBeenCalled();
  });

  it("works without an exit hook", () => {
    const h = harness(false);
    const response = h.response();
    h.supervisor.request("page:/", { type: "render" }, response);

    expect(() => h.children[0].emitExit()).not.toThrow();
    expect(response.fail).toHaveBeenCalledWith("child crashed");
  });
});
