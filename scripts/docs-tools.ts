// `npm run docs:tools`: regenerates the Inputs block of every docs/tools/<tool>.md page from the registered schema.
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listRegisteredTools, writeToolPages } from "./docs/inputs.js";

const dir = fileURLToPath(new URL("../docs/tools/", import.meta.url));

try {
  for (const { file, status } of await writeToolPages(await listRegisteredTools(), dir)) {
    console.log(`${status.padEnd(9)} ${relative(process.cwd(), file)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
