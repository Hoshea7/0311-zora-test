export type UpdateState =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateStatus {
  state: UpdateState;
  supported: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  progress?: UpdateProgress;
  checkedAt?: string;
  message?: string;
  error?: string;
}
