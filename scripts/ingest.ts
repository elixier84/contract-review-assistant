import path from "path";
import { ingestAllContracts } from "../src/lib/ingestion";
import { closeDb } from "../src/lib/db";

const contractsDir = path.join(process.cwd(), "contracts");

console.log("=== Contract Ingestion ===\n");

async function main() {
  await ingestAllContracts(contractsDir);
  closeDb();
  console.log("\nDone.");
}

main().catch(err => {
  console.error(err);
  closeDb();
  process.exit(1);
});
