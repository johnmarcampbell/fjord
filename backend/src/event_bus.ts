import { EventEmitter } from "node:events";
import type { StreamEvent } from "@fjord/shared";

const EVENT_NAME = "stream";

export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(event: StreamEvent): void {
    this.emitter.emit(EVENT_NAME, event);
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.emitter.on(EVENT_NAME, listener);
    return () => this.emitter.off(EVENT_NAME, listener);
  }
}
