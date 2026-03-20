export interface Contract {
  id: string;
  name: string;
  type: string;
  status: string;
  effective_date: string | null;
  expiry_date: string | null;
  parent_id: string | null;
  licensed_technology: string | null;
  territory: string | null;
  initial_fee: number | null;
  analysis_confidence: number | null;
  needs_review: number;
}

export interface Clause {
  id: number;
  contract_id: string;
  type: string;
  section: string | null;
  snippet: string;
  key_terms_json: string | null;
  confidence: number | null;
  needs_review: number;
}

export interface Definition {
  id: number;
  contract_id: string;
  term: string;
  definition: string;
  section: string | null;
}

export interface Relationship {
  id: number;
  source_id: string;
  target_id: string;
  type: string;
  evidence_text: string | null;
  evidence_section: string | null;
  confidence: number | null;
}

export interface PricingTable {
  id: number;
  contract_id: string;
  technology: string | null;
  name: string | null;
  section: string | null;
  royalty_basis: string | null;
  tiers_json: string | null;
  discounts_json: string | null;
  cpi_adjustment: string | null;
  aggregation_rules: string | null;
  is_used_in_reports: number;
  confidence: number | null;
  needs_review: number;
}

export interface ReviewNote {
  id: number;
  contract_id: string | null;
  type: string;
  issue: string;
  severity: string;
  is_reviewed: number;
  narrative: string | null;
  created_at: string;
  updated_at: string;
}

export interface Patent {
  id: number;
  contract_id: string;
  technology: string | null;
  country: string | null;
  patent_number: string | null;
  is_application: number;
}

export interface LicensedProduct {
  id: number;
  contract_id: string;
  technology: string | null;
  product_type: string | null;
  category: string | null;
}
