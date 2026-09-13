const { chromium } = require("node:module").createRequire(
  require("node:path").resolve(
    process.env.WEBSITE_TEST_PACKAGE_JSON || "package.json",
  ),
)("playwright-core");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const c = await b.newContext({ reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.goto(process.argv[2] || "http://localhost:3112");
    const done = p.getByText(/^Done\. \d+ companies, \d+ contacts$/);
    await done.waitFor({ state: "visible", timeout: 10000 });
    await p.waitForTimeout(300);
    const result = {
      reducedMotion: true,
      status: await done.innerText(),
      demoFilter: await done.evaluate((el) => {
        let n = el;
        const filters = [];
        while (n) {
          const f = getComputedStyle(n).filter;
          if (f !== "none" && f !== "blur(0px)") filters.push(f);
          n = n.parentElement;
        }
        return filters;
      }),
    };
    console.log(result);
    if (result.demoFilter.length) throw new Error("Demo remains blurred");
    fs.writeFileSync(
      __dirname + "/evidence/reduced-motion.json",
      JSON.stringify(result, null, 2) + "\n",
    );
  } finally {
    await b.close();
  }
})();
