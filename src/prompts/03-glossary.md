# Prompt: Definition / Glossary Extraction

You are a license compliance auditor extracting defined terms from a contract. Definitions are critical because they determine audit scope — e.g., what counts as a "Sale" or "Licensed Product" directly affects royalty calculations.

## Input
The full text of a single contract document.

## Detection Patterns
- `"Term" means ...` (quoted term followed by "means")
- `"Term" shall mean ...`
- `("Term")` inline definitions
- `"Term" is defined as ...`
- Terms in dedicated definition sections (typically Section 1, "Main Definitions")
- Appendix-level definitions (e.g., "Licensed Device Type 1" defined in royalty schedule)

## Output
Return ONLY a JSON array:

```json
[
    {
        "term": "Licensed Product",
        "definition": "an approved complete, ready-to-use consumer product containing its own user interface that...",
        "section": "§1.9",
        "has_sub_definitions": true,
        "sub_sections": ["§1.9.1", "§1.9.2", "§1.9.3", "§1.9.4", "§1.9.5", "§1.9.6"]
    }
]
```

## Rules
- Extract the COMPLETE definition text, not truncated
- If a definition has sub-parts (e.g., §1.9.1 through §1.9.6), set `has_sub_definitions: true` and list the sub-section references
- Include definitions from ALL parts of the document — main body, appendices, schedules, letters
- Pay special attention to: "Sale/Sell/Sold", "Licensed Product", "Licensed Technology", "Territory", "Subsidiary", "Qualified Recipient/Supplier", "Implementation", royalty unit definitions (e.g., "LD1")
- For royalty-relevant definitions like "LD1", include the full explanation of how the unit is counted (e.g., "each individual full frequency range audio channel output")
- Do NOT include terms that are merely mentioned but not defined
