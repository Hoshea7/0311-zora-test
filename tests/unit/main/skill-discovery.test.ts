import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-skill-discovery-"));
  tempHomes.add(homeDir);
  return homeDir;
}

function writeSkillFile(skillDir: string, name = path.basename(skillDir)) {
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${name} helper`, "---", "", `# ${name}`, ""].join("\n"),
    "utf8"
  );
}

async function loadSkillDiscoveryModule(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return import("@/main/skill-discovery");
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("discoverExternalSkills", () => {
  it("discovers external skills that are directory symlinks", async () => {
    const homeDir = createTempHome();
    const realSkillDir = path.join(homeDir, "shared-skills", "linked-skill");
    const codexSkillsDir = path.join(homeDir, ".codex", "skills");

    writeSkillFile(realSkillDir, "linked-skill");
    mkdirSync(codexSkillsDir, { recursive: true });
    symlinkSync(realSkillDir, path.join(codexSkillsDir, "linked-skill"), "dir");

    const { discoverExternalSkills } = await loadSkillDiscoveryModule(homeDir);

    const result = await discoverExternalSkills();
    const codexResult = result.tools.find((entry) => entry.tool.id === "codex");

    expect(codexResult?.exists).toBe(true);
    expect(codexResult?.skills.map((skill) => skill.dirName)).toContain("linked-skill");
    expect(result.totalNew).toBe(1);
  });

  it("marks symlinked external skills as installed when they point to an installed symlink target", async () => {
    const homeDir = createTempHome();
    const realSkillDir = path.join(homeDir, "shared-skills", "shared-target");
    const codexSkillsDir = path.join(homeDir, ".codex", "skills");
    const zoraSkillsDir = path.join(homeDir, ".zora", "skills");

    writeSkillFile(realSkillDir, "shared-target");
    mkdirSync(codexSkillsDir, { recursive: true });
    mkdirSync(zoraSkillsDir, { recursive: true });
    symlinkSync(realSkillDir, path.join(codexSkillsDir, "codex-alias"), "dir");
    symlinkSync(realSkillDir, path.join(zoraSkillsDir, "zora-alias"), "dir");

    const { discoverExternalSkills } = await loadSkillDiscoveryModule(homeDir);

    const result = await discoverExternalSkills();
    const codexResult = result.tools.find((entry) => entry.tool.id === "codex");
    const discoveredSkill = codexResult?.skills.find((skill) => skill.dirName === "codex-alias");

    expect(discoveredSkill?.alreadyInZora).toBe(true);
    expect(result.totalNew).toBe(0);
  });
});

describe("importSkill", () => {
  it("copies the real skill directory when the selected source is a symlink", async () => {
    const homeDir = createTempHome();
    const realSkillDir = path.join(homeDir, "shared-skills", "copy-source");
    const codexSkillsDir = path.join(homeDir, ".codex", "skills");
    const sourceLink = path.join(codexSkillsDir, "copy-source");

    writeSkillFile(realSkillDir, "copy-source");
    mkdirSync(codexSkillsDir, { recursive: true });
    symlinkSync(realSkillDir, sourceLink, "dir");

    const { importSkill } = await loadSkillDiscoveryModule(homeDir);

    const result = await importSkill(sourceLink, "copy", "codex", "copied-source");
    const installedPath = path.join(homeDir, ".zora", "skills", "copied-source");

    expect(result.success).toBe(true);
    expect(lstatSync(installedPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(path.join(installedPath, "SKILL.md"), "utf8")).toContain(
      "name: copy-source"
    );
  });
});
