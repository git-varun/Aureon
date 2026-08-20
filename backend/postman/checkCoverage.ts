import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listRoutes } from "./listRoutes";
import { ENDPOINTS } from "./endpoints";

function normalize(method: string, path: string): string {
  return `${method} ${path.replace(/:[a-zA-Z]+/g, ":param").replace(/\{\{[a-zA-Z0-9]+\}\}/g, ":param")}`;
}

export function checkCoverage() {
  const routeKeys = new Set(listRoutes().map((r) => normalize(r.method, r.fullPath)));
  const endpointKeys = new Set(ENDPOINTS.map((e) => normalize(e.method, e.path)));

  const collectionRaw = readFileSync(join(__dirname, "aureon.postman_collection.json"), "utf-8");
  const collection = JSON.parse(collectionRaw);
  const collectionKeys = new Set<string>();
  for (const folder of collection.item) {
    for (const item of folder.item) {
      const p = "/" + item.request.url.path.join("/");
      collectionKeys.add(normalize(item.request.method, p));
    }
  }

  const missingFromEndpoints = [...routeKeys].filter((k) => !endpointKeys.has(k));
  const staleInEndpoints = [...endpointKeys].filter((k) => !routeKeys.has(k));
  const missingFromCollection = [...endpointKeys].filter((k) => !collectionKeys.has(k));

  return { missingFromEndpoints, missingFromCollection, staleInEndpoints };
}

if (require.main === module) {
  const result = checkCoverage();
  const total = result.missingFromEndpoints.length + result.missingFromCollection.length + result.staleInEndpoints.length;
  console.log(JSON.stringify(result, null, 2));
  if (total > 0) {
    console.error(`coverage check FAILED: ${total} gap(s)`);
    process.exit(1);
  }
  console.log("coverage check PASSED: every registered route is in endpoints.ts and in the generated collection");
}
