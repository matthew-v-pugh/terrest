// Decorative, hand-arranged forms for the role select screen. Each blob is
// generated from its own seed so no two silhouettes repeat.
import { CONTOURS, CONTOURS_TOP, ROLE_BLOBS, SEEDS, blobPath } from '../organic.js';

export default function OrganicField() {
  return (
    <div className="organic-field" aria-hidden="true">
      {ROLE_BLOBS.map((b) => (
        <svg key={b.name} className={`organic-blob ${b.name}`} viewBox="0 0 200 200">
          <path d={blobPath(b.seed, b.lobes, b.wobble, b.stretchY)} fill={`var(--dp-color-${b.color})`} />
        </svg>
      ))}
      <svg className="organic-contours" viewBox="0 0 420 220" fill="none">
        {CONTOURS.map((d) => <path key={d} d={d} />)}
      </svg>
      <svg className="organic-contours top" viewBox="0 0 320 160" fill="none">
        {CONTOURS_TOP.map((d) => <path key={d} d={d} />)}
      </svg>
      <svg className="organic-seeds" viewBox="0 0 220 120">
        {SEEDS.map((s, i) => <circle key={i} {...s} />)}
      </svg>
    </div>
  );
}
