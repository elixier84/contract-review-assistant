import path from "path";
import { ingestAllContracts } from "../src/lib/ingestion";
import { closeDb } from "../src/lib/db";

const contractsDir = path.join(process.cwd(), "contracts");

console.log("=== Contract Ingestion ===\n");

async function main() {
  const results = await ingestAllContracts(contractsDir);
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
