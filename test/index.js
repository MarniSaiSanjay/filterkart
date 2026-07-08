// Aggregate test runner. Imports every *.test.js file, then runs the suite.
// Add new suites here as work items land.
import { run } from "./harness.js";

// Test suites — add new suites here as work items land.
import "./storage.test.js";
import "./registry.test.js";
import "./adapters.test.js";
import "./matcher.test.js";
import "./messaging.test.js";

await run();
