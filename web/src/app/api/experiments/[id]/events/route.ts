/**
 * SSE event stream for an experiment (web-refactor-plan.md §10 /events). Both
 * devices subscribe: the laptop authenticates with its user session, the phone
 * with the join token (?token=). The phone's open connection is the presence
 * signal that flips the laptop's "phone connected" badge.
 */
import { auth } from "@/auth";
import { getExperiment, getExperimentByToken } from "@/lib/experiments";
import {
  isPhoneOnline,
  phoneConnected,
  phoneDisconnected,
  subscribe,
  type ExperimentEvent,
} from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");

  let isPhone = false;
  if (token && (await getExperimentByToken(id, token))) {
    isPhone = true;
  } else {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || !(await getExperiment(id, userId))) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed
        }
      };
      const send = (event: ExperimentEvent) => write(`data: ${JSON.stringify(event)}\n\n`);

      send({ type: "hello", data: { phoneOnline: isPhoneOnline(id) } });
      unsubscribe = subscribe(id, send);
      heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      if (isPhone) phoneConnected(id);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        if (isPhone) phoneDisconnected(id);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
      if (isPhone) phoneDisconnected(id);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
