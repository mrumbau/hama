/**
 * Skeleton primitives — Tag 12 §4.1.
 *
 * Replaces pulse-dot spinners with layout-shaped placeholders per
 * design-taste-frontend §3 Rule 5. The variants match the geometry of
 * the eventual content so the operator reads the layout before data
 * arrives.
 */

import { cn } from "../lib/cn";
import styles from "./Skeleton.module.css";

export function SkeletonBar({ className }: { className?: string }) {
  return <span className={cn(styles.bar, className)} aria-hidden="true" />;
}

/** Sniper IDENTITY column placeholder — three rows mimicking match list. */
export function SkeletonIdentity() {
  return (
    <div className={styles.identity}>
      <SkeletonBar className={styles.row} />
      <SkeletonBar className={styles.row} />
      <SkeletonBar className={styles.row} />
    </div>
  );
}

/** Sniper WEB PRESENCE column placeholder — three thumb+text rows. */
export function SkeletonWebPresence() {
  return (
    <div className={styles.column}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.webRow}>
          <SkeletonBar className={styles.webThumb} />
          <div className={styles.webText}>
            <SkeletonBar className={styles.rowShort} />
            <SkeletonBar className={styles.rowShort} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sniper GEOGRAPHIC column placeholder — country block + subline + alts. */
export function SkeletonGeographic() {
  return (
    <div className={styles.geo}>
      <SkeletonBar className={styles.geoCountry} />
      <SkeletonBar className={styles.geoSubline} />
      <SkeletonBar className={styles.rowShort} />
    </div>
  );
}

/** Sniper AUTHENTICITY column placeholder — single big verdict block. */
export function SkeletonAuthenticity() {
  return (
    <div className={styles.column}>
      <SkeletonBar className={styles.authVerdict} />
      <SkeletonBar className={styles.rowShort} />
    </div>
  );
}

/** PoiDetail upload tile placeholder — square thumb + two metadata rows. */
export function SkeletonPoiTile() {
  return (
    <div className={styles.tile}>
      <SkeletonBar className={styles.tileThumb} />
      <SkeletonBar className={styles.rowShort} />
      <SkeletonBar className={styles.rowShort} />
    </div>
  );
}
