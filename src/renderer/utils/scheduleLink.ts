import type { AssistantAction, ProcessStep, ScheduledTaskDetailLink } from "../types";
import {
  extractScheduleDetailLinkFromToolResultValue,
  parseScheduleDetailLink,
} from "../../shared/schedule-link";

export { parseScheduleDetailLink };

export function extractScheduleDetailLinkFromToolResult(
  result?: string
): ScheduledTaskDetailLink | null {
  if (!result) {
    return null;
  }

  return extractScheduleDetailLinkFromToolResultValue(result);
}

export function findScheduleDetailLinkInSteps(
  steps: ProcessStep[]
): ScheduledTaskDetailLink | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.type !== "tool") {
      continue;
    }

    const link = extractScheduleDetailLinkFromToolResult(step.tool.result);
    if (link) {
      return link;
    }
  }

  return null;
}

export function findScheduleDetailLinkInActions(
  actions?: AssistantAction[]
): ScheduledTaskDetailLink | null {
  if (!actions) {
    return null;
  }

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];

    if (action.type === "schedule-task-link") {
      return action.link;
    }
  }

  return null;
}
