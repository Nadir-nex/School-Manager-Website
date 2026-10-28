// Demo data provider. Returns normalized in-memory school data generated
// from the seeded synthetic generator. No network, no SQL, no writes.
import { generateDemoData, computeDashboard } from "./demo-data.js";

export function createDemoDataProvider(options = {}) {
  return {
    kind: "demo",
    async load() {
      const data = generateDemoData(options);
      return { data, dashboard: computeDashboard(data) };
    }
  };
}

export { generateDemoData, computeDashboard };
