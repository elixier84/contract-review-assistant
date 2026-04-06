import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");

  // If project_id is specified, only return technologies linked to that project's contracts
  const technologies = projectId
    ? db.prepare(
        `SELECT DISTINCT t.* FROM technologies t
         JOIN tech_contract_map tcm ON tcm.tech_id = t.id
         JOIN contracts c ON c.id = tcm.contract_id
         WHERE c.project_id = ?
         ORDER BY t.name`
      ).all(projectId)
    : db.prepare("SELECT * FROM technologies ORDER BY name").all();

  // For each technology, get the contract chain
  const enriched = (technologies as Record<string, unknown>[]).map((tech) => {
    const contractMap = db
      .prepare(
        `SELECT tcm.role, c.id, c.name, c.type, c.status
         FROM tech_contract_map tcm
         JOIN contracts c ON c.id = tcm.contract_id
         WHERE tcm.tech_id = ?
         ORDER BY tcm.role, c.id`
      )
      .all(tech.id);

    const patents = db
      .prepare(
        `SELECT country, patent_number, is_application
         FROM patents WHERE technology = ? ORDER BY country`
      )
      .all(tech.name);

    const products = db
      .prepare(
        `SELECT product_type, category, contract_id
         FROM licensed_products WHERE technology = ?`
      )
      .all(tech.name);

    return { ...tech, contracts: contractMap, patents, products };
  });

  return NextResponse.json({ technologies: enriched });
}
