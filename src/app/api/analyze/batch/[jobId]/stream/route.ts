import { jobManager } from "@/lib/job-manager";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = jobManager.getJob(jobId);

  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      // Send current state as initial snapshot
      const snapshot = jobManager.getJobSnapshot(jobId);
      if (snapshot) {
        send("snapshot", JSON.stringify(snapshot));
      }

      // If job already completed or failed, close immediately
      if (job.status === "completed" || job.status === "failed") {
        send(job.status === "completed" ? "job_complete" : "job_error", JSON.stringify({
          status: job.status,
          error: job.error ?? null,
        }));
        controller.close();
        return;
      }

      // Subscribe to future events
      const unsubscribe = jobManager.subscribe(jobId, (event, data) => {
        try {
          send(event, data);
          if (event === "job_complete" || event === "job_error") {
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
