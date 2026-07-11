import { runSelfTest } from "../src/selftest.js";

const ok = await runSelfTest();
process.exit(ok ? 0 : 1);
