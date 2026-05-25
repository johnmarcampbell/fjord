import type { FastifyPluginAsync } from "fastify";
import type { StreamEvent } from "@agentic-kanban/shared";

function shouldForwardEvent(event: StreamEvent, affiliatedSpaceIds: Set<string>): boolean {
  if (event.type === "demo.reset") return true;
  return affiliatedSpaceIds.has(event.space_id);
}

export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/events/stream",
    {
      schema: {
        summary: "Server-sent events stream of task updates",
        tags: ["stream"],
      },
    },
    async (req, reply) => {
      // Capture the subscriber's affiliated spaces at connect time (snapshot).
      const affiliatedSpaceIds: Set<string> = req.actor?.affiliatedSpaceIds ?? new Set();

      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");

      const unsubscribe = app.events.subscribe((event) => {
        if (!shouldForwardEvent(event, affiliatedSpaceIds)) return;
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 30000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        if (!res.writableEnded) res.end();
      };
      req.raw.on("close", cleanup);
      req.raw.on("error", cleanup);
    },
  );
};
