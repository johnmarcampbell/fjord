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
    // Isolate listener failures: a throwing subscriber must not prevent other
    // subscribers from receiving the event, and must never propagate back into
    // a publisher — Task mutations publish after COMMIT, so a listener error
    // surfacing there would misreport a durably committed write as a failure.
    const safe = (event: StreamEvent) => {
      try {
        listener(event);
      } catch (err) {
        console.error("EventBus subscriber threw; event dropped for this subscriber", err);
      }
    };
    this.emitter.on(EVENT_NAME, safe);
    return () => this.emitter.off(EVENT_NAME, safe);
  }
}
