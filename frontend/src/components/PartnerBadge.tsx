export default function PartnerBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Partner organisation"
      className={
        "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-500/30 " +
        className
      }
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.2 2.73.99-5.78L1.58 7.62l5.82-.85L10 1.5z" />
      </svg>
      Partner
    </span>
  );
}
