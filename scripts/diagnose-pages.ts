/**
 * diagnose-pages.ts
 * Page-by-page parsing diagnosis for all contracts in a project.
 * Shows total pages, empty pages, low-density pages, and coverage.
 */

import Database from "better-sqlite3";
import pdfParse from "pdf-parse";
import fs from "fs";
import path from "path";

const db = new Database(path.join(process.cwd(), "data", "contracts.db"), { readonly: true });

const projectId = 2; // Cadence-Samsung
const rows = db.prepare("SELECT id, name, file_path, length(raw_text) as text_len FROM contracts WHERE project_id = ? ORDER BY id").all(projectId) as {
  id: string; name: string; file_path: string; text_len: number;
}[];

async function diagnose() {
  for (const r of rows) {
    if (!r.file_path || !fs.existsSync(r.file_path)) {
      console.log(`\n=== ${r.id} | FILE MISSING: ${r.file_path}`);
      continue;
    }

    const buf = fs.readFileSync(r.file_path);
    const fileSize = (buf.length / 1024).toFixed(0);
    const fileName = path.basename(r.file_path);

    // Page-by-page text extraction
    const pageTexts: string[] = [];
    const options = {
      pagerender: (pageData: { getTextContent: () => Promise<{ items: { str: string }[] }> }) => {
        return pageData.getTextContent().then((tc) => {
          const text = tc.items.map((item) => item.str).join(" ");
          pageTexts.push(text);
          return text;
        });
      },
    };

    try {
      const pdf = await pdfParse(buf, options);
      const totalPages = pdf.numpages;

      const emptyPages: number[] = [];
      const lowPages: number[] = [];
      let parserTotalChars = 0;

      for (let i = 0; i < pageTexts.length; i++) {
        const len = pageTexts[i].length;
        parserTotalChars += len;
        if (len < 10) emptyPages.push(i + 1);
        else if (len < 100) lowPages.push(i + 1);
      }

      const readablePages = totalPages - emptyPages.length;
      const coverage = Math.round((readablePages / totalPages) * 100);

      console.log("");
      console.log(`=== ${r.id} | ${fileName}`);
      console.log(`    File: ${fileSize} KB | Total pages: ${totalPages}`);
      console.log(`    Parser chars: ${parserTotalChars} | DB raw_text: ${r.text_len} chars`);
      console.log(`    Empty pages (<10 chars): ${emptyPages.length}${emptyPages.length ? ` → [${emptyPages.join(", ")}]` : ""}`);
      console.log(`    Low pages (<100 chars):  ${lowPages.length}${lowPages.length ? ` → [${lowPages.join(", ")}]` : ""}`);
      console.log(`    Coverage: ${readablePages}/${totalPages} pages (${coverage}%)`);

      if (coverage < 80) {
        console.log(`    ⚠️  LOW COVERAGE — ${totalPages - readablePages} pages unreadable`);
      }
    } catch (err) {
      console.log(`\n=== ${r.id} | ${fileName} | ERROR: ${(err as Error).message}`);
    }
  }
}

diagnose().then(() => {
  db.close();
  console.log("\n--- Done ---");
});
