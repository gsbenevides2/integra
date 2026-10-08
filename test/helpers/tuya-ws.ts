import { EventEmitter } from "node:events";

import { mock } from "bun:test";

export class FakeWebSocket extends EventEmitter {
  static instances: FakeWebSocket[] = [];
  OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  pings: unknown[] = [];
  pongs: unknown[] = [];

  constructor(
    public url: string,
    public options: unknown,
  ) {
    super();
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  ping(data: unknown) {
    this.pings.push(data);
  }
  pong(data: unknown) {
    this.pongs.push(data);
  }
}

export async function installFakeWs(): Promise<() => void> {
  const real = { ...(await import("ws")) };
  mock.module("ws", () => ({ default: FakeWebSocket, WebSocket: FakeWebSocket }));
  return () => {
    mock.module("ws", () => real);
  };
}
