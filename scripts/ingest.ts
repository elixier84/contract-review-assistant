import path from "path";
import { ingestAllContracts } from "../src/lib/ingestion";
import { closeDb } from "../src/lib/db";

// Usage: npx tsx scripts/ingest.ts [--dir <folder>] [--project <id>]
// Default: contracts/ folder, no project assignment

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const dirArg = getArg("--dir") || "contracts";
const projectIdArg = getArg("--project");
const contractsDir = path.resolve(process.cwd(), dirArg);
const projectId = projectIdArg ? Number(projectIdArg) : undefined;

console.log("=== Contract Ingestion ===");
console.log(`Directory: ${contractsDir}`);
if (projectId) console.log(`Project ID: ${projectId}`);
console.log();

async function main() {
  const results = await ingestAllContracts(contractsDir, projectId);
  const errors = results.filter((r) => r.status === "error");
  closeDb();

  console.log(`\nIngested: ${results.length - errors.length}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    process.exit(1);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  closeDb();
  process.exit(1);
});
