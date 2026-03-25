import { generateHtmlReport } from "../../../../scripts/export-html";

export async function GET() {
  try {
    const { html } = generateHtmlReport();
    const timestamp = new Date().toISOString().slice(0, 10);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="contract-review-${timestamp}.html"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
