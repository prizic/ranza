/**
 * The mark: a bunk seen from the side, two posts and two berths. "Ranza" is
 * Turkish for a bunk, so the product's name is drawn rather than illustrated.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M3 1.5v13M13 1.5v13M3 5.5h10M3 11h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
