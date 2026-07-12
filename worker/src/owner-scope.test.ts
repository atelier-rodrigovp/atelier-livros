import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const files = ["jobs.ts", "index.ts", "hidratar.ts"];
const ownedTables = new Set(["projects", "editions", "chapters", "artifacts", "publishing_packages", "jobs", "sales_imports", "sales_rows", "authors", "social_posts"]);
const here = path.dirname(fileURLToPath(import.meta.url));

describe("service_role sempre explicita owner", () => {
  for (const file of files) it(file, () => {
    const src = readFileSync(path.join(here, file), "utf8");
    const statements = src.split(/;\s*(?:\r?\n|$)/);
    const violations: string[] = [];
    for (const statement of statements) {
      const table = statement.match(/\.from\("([^"]+)"\)/)?.[1];
      if (!table || !ownedTables.has(table)) continue;
      const isScopedOperation = /\.(?:select|update|delete)\(/.test(statement);
      const ownedWrite = /\.(?:insert|upsert)\(/.test(statement) && /owner\s*:\s*OWNER/.test(statement);
      if (isScopedOperation && !ownedWrite && !statement.includes('.eq("owner", OWNER)')) violations.push(`${table}: ${statement.trim().slice(0, 140)}`);
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
