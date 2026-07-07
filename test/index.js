// Aggregate test runner. Imports every *.test.js file, then runs the suite.
// Add new suites here as work items land.
import { run } from "./harness.js";

// Test suites (uncomment/add as modules are implemented):
import "./storage.test.js";
import "./registry.test.js";
import "./adapters.test.js";
// import "./matcher.test.js";

await run();
