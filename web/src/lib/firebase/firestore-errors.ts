const INDEX_BUILDING_PATTERN = /index.*building|currently building/i;
const INDEX_REQUIRED_PATTERN = /requires an index|failed-precondition/i;

export function isFirestoreIndexBuildingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return INDEX_BUILDING_PATTERN.test(error.message);
}

export function isFirestoreIndexError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    INDEX_BUILDING_PATTERN.test(error.message) ||
    (INDEX_REQUIRED_PATTERN.test(error.message) && /index/i.test(error.message))
  );
}

/** User-facing copy for Firestore index / precondition failures. */
export function getFirestoreErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!(error instanceof Error)) return fallback;
  if (isFirestoreIndexBuildingError(error)) {
    return "Setting up — please wait a moment, then refresh.";
  }
  if (isFirestoreIndexError(error)) {
    return "Data access is being configured. Please wait a moment and try again.";
  }
  return error.message || fallback;
}

export function normalizeFirestoreError(error: unknown, fallback = "Something went wrong"): Error {
  return new Error(getFirestoreErrorMessage(error, fallback));
}
