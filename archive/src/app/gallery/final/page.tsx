import type { Metadata } from "next";
import Link from "next/link";

import { FinalDesignBuilder } from "@/gallery/review/builder";
import { reviewDesigns } from "@/gallery/review/designs";
import styles from "@/gallery/review/pages.module.css";

export const metadata: Metadata = {
  title: "Build your final design | MMHR design gallery",
  robots: { index: false, follow: false },
};

export default function BuildFinalDesignPage() {
  return (
    <main className={styles.page}>
      <div className={`${styles.wrap} ${styles.top}`}>
        <Link className={styles.back} href="/gallery">All designs</Link>
      </div>
      <FinalDesignBuilder designs={reviewDesigns} />
    </main>
  );
}
