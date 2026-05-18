import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app } from "electron";

const tempHomes = new Set<string>();
const bootstrapDirName = "bootstrap";
const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-skill-manager-"));
  tempHomes.add(homeDir);
  return homeDir;
}

function writeSkillFile(skillDir: string, content: string) {
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf8");
}

function configureBundledSkills(homeDir: string) {
  const resourcesDir = path.join(homeDir, "resources");
  writeSkillFile(
    path.join(resourcesDir, "skills", "docx"),
    ["---", "name: docx", "description: Document helper", "---", "", "# Docx", ""].join("\n")
  );

  (app as typeof app & { isPackaged: boolean }).isPackaged = true;
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: resourcesDir,
    writable: true,
  });
}

function resetBundledSkillsConfig() {
  (app as typeof app & { isPackaged: boolean }).isPackaged = false;

  if (originalResourcesPath === undefined) {
    delete (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    return;
  }

  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: originalResourcesPath,
    writable: true,
  });
}

async function loadSkillManagerModule(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return import("@/main/skill-manager");
}

afterEach(() => {
  resetBundledSkillsConfig();
  vi.doUnmock("node:os");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("seedBundledSkills", () => {
  it("does not seed bootstrap from bundled skills", async () => {
    const homeDir = createTempHome();
    configureBundledSkills(homeDir);
    const { listSkills, seedBundledSkills } = await loadSkillManagerModule(homeDir);

    await seedBundledSkills();

    const seededSkills = await listSkills();
    const seededDirNames = seededSkills.map((skill) => skill.dirName);

    expect(seededDirNames).toContain("docx");
    expect(seededDirNames).not.toContain(bootstrapDirName);
  });
});

describe("listSkills", () => {
  it("includes skills installed as directory symlinks", async () => {
    const homeDir = createTempHome();
    const externalSkillDir = path.join(homeDir, "external", "linked-helper");
    const zoraSkillsDir = path.join(homeDir, ".zora", "skills");

    writeSkillFile(
      externalSkillDir,
      ["---", "name: linked-helper", "description: Linked helper", "---", "", "# Linked", ""].join("\n")
    );
    mkdirSync(zoraSkillsDir, { recursive: true });
    symlinkSync(externalSkillDir, path.join(zoraSkillsDir, "linked-helper"), "dir");

    const { listSkills } = await loadSkillManagerModule(homeDir);

    const skills = await listSkills();

    expect(skills).toEqual([
      expect.objectContaining({
        dirName: "linked-helper",
        name: "linked-helper",
        description: "Linked helper",
      }),
    ]);
  });
});
