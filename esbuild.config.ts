import { build, context, type BuildOptions } from "esbuild";

const isWatch = process.argv.includes("--watch");

const shared: BuildOptions = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  tsconfig: "tsconfig.json"
};

const builds: BuildOptions[] = [
  {
    ...shared,
    entryPoints: ["src/main/index.ts"],
    outfile: "dist/main/index.js"
  },
  {
    ...shared,
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/main/preload.js"
  }
];

async function run() {
  if (isWatch) {
    const contexts = await Promise.all(builds.map((options) => context(options)));
    await Promise.all(contexts.map((item) => item.watch()));
    console.log("[esbuild] watching main and preload");
    return;
  }

  await Promise.all(builds.map((options) => build(options)));
  console.log("[esbuild] built main and preload");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
