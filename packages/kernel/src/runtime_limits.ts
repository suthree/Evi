export const MIN_RUNTIME_LEASE_MS = 100;
export const MAX_RUNTIME_LEASE_MS = 300_000;
export const MAX_RUNTIME_TIMEOUT_MS = 2_147_483_647;

export function validateRuntimeLeaseDuration(value: number, label: string): void {
  if (!Number.isInteger(value) || value < MIN_RUNTIME_LEASE_MS || value > MAX_RUNTIME_LEASE_MS) {
    throw new Error(`${label} lease duration is invalid.`);
  }
}

export function validateRuntimeTimeoutDuration(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RUNTIME_TIMEOUT_MS) {
    throw new Error(`${label} timeout duration is invalid.`);
  }
}
