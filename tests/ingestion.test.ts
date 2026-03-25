import { describe, it, expect } from "vitest";
import { computeFileHash, deriveContractId } from "../src/lib/ingestion";

// ---------------------------------------------------------------------------
// computeFileHash
// ---------------------------------------------------------------------------

describe("computeFileHash", () => {
  it("returns consistent SHA-256 hex for the same input", () => {
    const buf = Buffer.from("hello world");
    const hash1 = computeFileHash(buf);
    const hash2 = computeFileHash(buf);
    expect(hash1).toBe(hash2);
  });

  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = computeFileHash(Buffer.from("test"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different hashes for different content", () => {
    const hash1 = computeFileHash(Buffer.from("content A"));
    const hash2 = computeFileHash(Buffer.from("content B"));
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty buffer", () => {
    const hash = computeFileHash(Buffer.alloc(0));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // SHA-256 of empty input is the well-known value
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("handles binary content", () => {
    const buf = Buffer.from([0x00, 0xff, 0x50, 0x4b, 0x03, 0x04]); // ZIP header bytes
    const hash = computeFileHash(buf);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// deriveContractId
// ---------------------------------------------------------------------------

describe("deriveContractId", () => {
  it("extracts ID from MASKED_85001_Name.docx pattern", () => {
    expect(deriveContractId("MASKED_85001_Standard_T_and_C.docx")).toBe("85001");
  });

  it("extracts ID from 85001_Name.docx pattern", () => {
    expect(deriveContractId("85001_License_Agreement.docx")).toBe("85001");
  });

  it("extracts ID from Agreement_85001.docx pattern", () => {
    expect(deriveContractId("Agreement_85001.docx")).toBe("85001");
  });

  it("extracts 5-digit IDs", () => {
    expect(deriveContractId("MASKED_12345_Contract.pdf")).toBe("12345");
  });

  it("extracts 6-digit IDs", () => {
    expect(deriveContractId("Contract_123456_License.docx")).toBe("123456");
  });

  it("extracts 4-digit IDs", () => {
    expect(deriveContractId("Doc_1234_terms.txt")).toBe("1234");
  });

  it("ignores 3-digit numbers (too short)", () => {
    // 3-digit numbers don't match the 4-6 digit pattern
    // This will hit the fallback path which needs DB — so we just test it doesn't match
    const result = deriveContractId("doc_123_terms.txt");
    // Since 123 is only 3 digits, the regex won't match it
    // The function will try DB fallback, which will fail in test context
    // Just verify it doesn't return "123"
    expect(result).not.toBe("123");
  });

  it("handles hyphen-delimited filenames", () => {
    expect(deriveContractId("contract-85002-pricing.pdf")).toBe("85002");
  });

  it("handles dot-delimited filenames", () => {
    expect(deriveContractId("contract.85003.license.docx")).toBe("85003");
  });

  it("picks the first matching number when multiple exist", () => {
    expect(deriveContractId("MASKED_85001_ref_85002.docx")).toBe("85001");
  });
});
