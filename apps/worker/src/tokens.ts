/**
 * The token every job module injects the composition root by.
 *
 * Its own file, and above the job folders, because the composition is shared:
 * two modules each providing it would open two connection pools and check the
 * role twice.
 */
export const COMPOSITION = Symbol("worker.composition");
