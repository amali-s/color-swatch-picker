interface Props {
  /** Run the shimmer (dropped under prefers-reduced-motion). */
  animate: boolean;
}

/**
 * The three faint stacked placeholders in the camera idle/hold states (14-67,
 * 14-121): low-emphasis loading skeletons that occupy the reveal slots before
 * any blob data exists. Each is an empty square + a shimmer line — decorative,
 * so hidden from assistive tech.
 */
export default function SkeletonChips({ animate }: Props) {
  return (
    <div className={`skeleton-chips${animate ? ' is-animated' : ''}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="skeleton-chip" key={i}>
          <span className="skeleton-chip__square" />
          <span className="skeleton-chip__line" />
        </div>
      ))}
    </div>
  );
}
