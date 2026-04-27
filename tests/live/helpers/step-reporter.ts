import {
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface StepLog {
  name: string;
  action: string;
  input?: string;
  output?: string;
  passed: boolean;
  failReason?: string;
  durationMs: number;
}

export interface CaseReport {
  caseId: string;
  title: string;
  provider: string;
  startedAt: string;
  steps: StepLog[];
  totalDurationMs: number;
  allPassed: boolean;
}

export function createCaseReporter(
  caseId: string,
  title: string,
  providerName: string
) {
  const report: CaseReport = {
    caseId,
    title,
    provider: providerName,
    startedAt: new Date().toISOString(),
    steps: [],
    totalDurationMs: 0,
    allPassed: true,
  };

  let currentInput: string | undefined;
  let currentOutput: string | undefined;
  let written = false;

  const reporter = {
    setInput(input: string) {
      currentInput = input;
    },

    setOutput(output: string) {
      currentOutput = output;
    },

    async step(name: string, action: string, fn: () => Promise<void> | void) {
      currentInput = undefined;
      currentOutput = undefined;

      const start = Date.now();
      let passed = true;
      let failReason: string | undefined;

      try {
        await fn();
      } catch (error) {
        passed = false;
        failReason = error instanceof Error ? error.message : String(error);
        report.allPassed = false;
        throw error;
      } finally {
        const durationMs = Date.now() - start;
        const stepLog: StepLog = {
          name,
          action,
          input: currentInput,
          output: currentOutput,
          passed,
          failReason,
          durationMs,
        };

        report.steps.push(stepLog);

        const icon = passed ? "✅" : "❌";
        console.log(`  ${icon} ${name} (${durationMs}ms)`);
        if (currentInput) {
          console.log(`     输入: ${truncate(currentInput, 200)}`);
        }
        if (currentOutput) {
          console.log(`     输出: ${truncate(currentOutput, 200)}`);
        }
        if (failReason) {
          console.log(`     失败: ${truncate(failReason, 200)}`);
        }
      }
    },

    done() {
      if (written) {
        return;
      }

      written = true;
      report.totalDurationMs = report.steps.reduce(
        (sum, step) => sum + step.durationMs,
        0
      );

      const passedCount = report.steps.filter((step) => step.passed).length;
      const totalCount = report.steps.length;

      console.log("");
      console.log(
        `  📋 ${report.caseId} ${report.title}: ${passedCount}/${totalCount} 步骤通过 | ${report.totalDurationMs}ms`
      );
      console.log("");

      appendToReportFile(report);
    },
  };

  return reporter;
}

export function initReportFile() {
  const reportPath = getReportPath();
  const reportDir = dirname(reportPath);

  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  if (existsSync(reportPath) && statSync(reportPath).size > 0) {
    return;
  }

  const header = [
    "# ZoraAgent Live Test Report",
    "",
    `**运行时间**: ${new Date().toISOString()}`,
    `**环境**: ${process.platform} / Node ${process.version}`,
    "",
    "---",
    "",
  ].join("\n");

  writeFileSync(reportPath, header, "utf8");
}

function appendToReportFile(report: CaseReport) {
  const reportPath = getReportPath();

  const lines: string[] = [
    `## ${report.caseId} ${report.title}`,
    "",
    "| 项目 | 值 |",
    "|------|-----|",
    `| Provider | ${escapeTable(report.provider)} |`,
    `| 开始时间 | ${report.startedAt} |`,
    `| 总耗时 | ${report.totalDurationMs}ms |`,
    `| 结果 | ${report.allPassed ? "✅ 全部通过" : "❌ 存在失败"} |`,
    "",
    "| # | 步骤 | 操作 | 输入 | 输出 | 结果 | 耗时 |",
    "|---|------|------|------|------|------|------|",
  ];

  report.steps.forEach((step, index) => {
    const icon = step.passed ? "✅" : "❌";
    const input = step.input ? truncate(step.input, 80) : "-";
    const output = step.output ? truncate(step.output, 80) : "-";
    const fail = step.failReason
      ? ` (${truncate(step.failReason, 60)})`
      : "";

    lines.push(
      `| ${index + 1} | ${escapeTable(step.name)} | ${escapeTable(step.action)} | ${escapeTable(input)} | ${escapeTable(output)} | ${icon}${escapeTable(fail)} | ${step.durationMs}ms |`
    );
  });

  lines.push("");
  lines.push("---");
  lines.push("");

  appendFileSync(reportPath, lines.join("\n"), "utf8");
}

function getReportPath(): string {
  return join(
    process.cwd(),
    "tests",
    ".artifacts",
    "live",
    "reports",
    "test-report.md"
  );
}

function escapeTable(value: string): string {
  return value.replace(/\n/g, " ").replace(/\|/g, "\\|");
}

function truncate(value: string, maxLen: number): string {
  const flat = escapeTable(value);
  return flat.length > maxLen ? `${flat.slice(0, maxLen - 3)}...` : flat;
}
