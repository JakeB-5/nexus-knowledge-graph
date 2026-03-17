import { describe, it, expect } from "vitest";
import { EntityExtractor } from "../entity-extractor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extract(text: string) {
  return new EntityExtractor().extract(text);
}

function extractTypes(text: string) {
  return extract(text).map((e) => e.type);
}

// ---------------------------------------------------------------------------
// Email detection
// ---------------------------------------------------------------------------

describe("EntityExtractor – EMAIL", () => {
  it("detects a simple email address", () => {
    const entities = extract("Contact us at hello@example.com for details.");
    const emails = entities.filter((e) => e.type === "EMAIL");
    expect(emails.length).toBeGreaterThan(0);
    expect(emails[0]!.name).toContain("hello@example.com");
  });

  it("detects email with subdomain", () => {
    const entities = extract("Email user@mail.company.org today.");
    const emails = entities.filter((e) => e.type === "EMAIL");
    expect(emails.length).toBeGreaterThan(0);
  });

  it("records correct start/end offsets", () => {
    const text = "Send to test@example.com now";
    const entities = extract(text);
    const email = entities.find((e) => e.type === "EMAIL");
    expect(email).toBeDefined();
    expect(text.slice(email!.start, email!.end)).toBe(email!.name);
  });
});

// ---------------------------------------------------------------------------
// URL detection
// ---------------------------------------------------------------------------

describe("EntityExtractor – URL", () => {
  it("detects https URL", () => {
    const entities = extract("Visit https://www.example.com/path?q=1 for info.");
    const urls = entities.filter((e) => e.type === "URL");
    expect(urls.length).toBeGreaterThan(0);
  });

  it("detects http URL", () => {
    const entities = extract("See http://example.org for details.");
    const urls = entities.filter((e) => e.type === "URL");
    expect(urls.length).toBeGreaterThan(0);
  });

  it("detects www URL without protocol", () => {
    const entities = extract("Check www.google.com out.");
    const urls = entities.filter((e) => e.type === "URL");
    expect(urls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Date detection
// ---------------------------------------------------------------------------

describe("EntityExtractor – DATE", () => {
  it("detects numeric date MM/DD/YYYY", () => {
    const entities = extract("The meeting is on 12/25/2024.");
    const dates = entities.filter((e) => e.type === "DATE");
    expect(dates.length).toBeGreaterThan(0);
  });

  it("detects ISO date YYYY-MM-DD", () => {
    const entities = extract("Deadline: 2024-03-15.");
    const dates = entities.filter((e) => e.type === "DATE");
    expect(dates.length).toBeGreaterThan(0);
  });

  it("detects written date like January 1, 2024", () => {
    const entities = extract("It happened on January 1, 2024.");
    const dates = entities.filter((e) => e.type === "DATE");
    expect(dates.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Number detection
// ---------------------------------------------------------------------------

describe("EntityExtractor – NUMBER", () => {
  it("detects plain integer", () => {
    const entities = extract("There are 42 items in stock.");
    const numbers = entities.filter((e) => e.type === "NUMBER");
    expect(numbers.length).toBeGreaterThan(0);
  });

  it("detects decimal number", () => {
    const entities = extract("The temperature is 98.6 degrees.");
    const numbers = entities.filter((e) => e.type === "NUMBER");
    expect(numbers.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Currency detection
// ---------------------------------------------------------------------------

describe("EntityExtractor – CURRENCY", () => {
  it("detects dollar amount", () => {
    const entities = extract("The item costs $19.99.");
    const currencies = entities.filter((e) => e.type === "CURRENCY");
    expect(currencies.length).toBeGreaterThan(0);
    expect(currencies[0]!.name).toContain("$");
  });

  it("detects euro amount", () => {
    const entities = extract("Price: €50.");
    const currencies = entities.filter((e) => e.type === "CURRENCY");
    expect(currencies.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Proper noun detection
// ---------------------------------------------------------------------------

describe("EntityExtractor – proper nouns", () => {
  it("detects person name (two capitalized words mid-sentence)", () => {
    const entities = extract("Yesterday, John Smith gave a speech.");
    const persons = entities.filter((e) => e.type === "PERSON");
    expect(persons.length).toBeGreaterThan(0);
    expect(persons.some((e) => e.name.includes("John"))).toBe(true);
  });

  it("detects organization with suffix", () => {
    const entities = extract("Apple Inc released a new product today.");
    const orgs = entities.filter((e) => e.type === "ORGANIZATION");
    expect(orgs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Overlap removal
// ---------------------------------------------------------------------------

describe("EntityExtractor – overlap removal", () => {
  it("no two entities overlap in character ranges", () => {
    const text = "Contact john.doe@example.com or visit https://example.com today.";
    const entities = extract(text);
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]!;
        const b = entities[j]!;
        const overlaps = a.start < b.end && a.end > b.start;
        expect(overlaps).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Custom patterns
// ---------------------------------------------------------------------------

describe("EntityExtractor – custom patterns", () => {
  it("registers and detects a custom entity type", () => {
    const extractor = new EntityExtractor({
      enabledTypes: new Set(["MISC"]),
    });
    extractor.registerPattern("MISC", /\bNEXUS-\d+\b/g);
    const entities = extractor.extract("Issue NEXUS-1234 is open.");
    const misc = entities.filter((e) => e.type === "MISC");
    expect(misc.length).toBeGreaterThan(0);
    expect(misc[0]!.name).toBe("NEXUS-1234");
  });
});

// ---------------------------------------------------------------------------
// Enabled types filtering
// ---------------------------------------------------------------------------

describe("EntityExtractor – enabledTypes", () => {
  it("only returns enabled entity types", () => {
    const extractor = new EntityExtractor({
      enabledTypes: new Set(["EMAIL"]),
    });
    const entities = extractor.extract(
      "Email me at a@b.com or visit https://b.com on 01/01/2024.",
    );
    for (const entity of entities) {
      expect(entity.type).toBe("EMAIL");
    }
  });
});

// ---------------------------------------------------------------------------
// Offset correctness
// ---------------------------------------------------------------------------

describe("EntityExtractor – offset correctness", () => {
  it("all entity offsets are correct", () => {
    const text = "Call us at +1 or email support@nexus.io for help.";
    const entities = extract(text);
    for (const entity of entities) {
      expect(text.slice(entity.start, entity.end)).toBe(entity.name);
    }
  });
});
