import { generateHtmlReport } from "../../../../scripts/export-html";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectIdParam = searchParams.get("project_id");
    const projectId = projectIdParam ? Number(projectIdParam) : undefined;

    const { html, projectName } = generateHtmlReport(undefined, projectId);
    const timestamp = new Date().toISOString().slice(0, 10);
    const slug = (projectName || "all").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const filename = `${slug}-${timestamp}.html`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
