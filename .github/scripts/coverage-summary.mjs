// Prints the totals from coverage/coverage-summary.json as a Markdown table.
import { readFileSync } from "node:fs";

const { total } = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));

console.log("### Frontend test coverage\n");
console.log("| Metric | Covered | Total | % |");
console.log("|---|---:|---:|---:|");
for (const metric of ["lines", "statements", "functions", "branches"]) {
  const { covered, total: count, pct } = total[metric];
  console.log(`| ${metric} | ${covered} | ${count} | ${pct}% |`);
}
