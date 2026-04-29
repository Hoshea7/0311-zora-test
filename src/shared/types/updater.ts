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

export type UpdateInstallMode = "automatic" | "manual";

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateStatus {
  state: UpdateState;
  supported: boolean;
  installMode: UpdateInstallMode;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  manualUpdateUrl?: string;
  progress?: UpdateProgress;
  checkedAt?: string;
  message?: string;
  error?: string;
}
