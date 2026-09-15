import Image from "next/image";
import styles from "./Brand.module.css";

type BrandProps = {
  variant?: "inline" | "stacked" | "wordmark";
  eager?: boolean;
};

/** 文字とマークを別素材に保ち、表示枠で透明な余白だけを詰める。 */
export function Brand({ variant = "inline", eager = false }: BrandProps) {
  return (
    <div className={`${styles.brand} ${styles[variant]}`}>
      {variant !== "wordmark" && (
        <span className={styles.symbol} aria-hidden="true">
          <Image
            src="/brand/symbol-v6.png"
            alt=""
            fill
            sizes={variant === "stacked" ? "72px" : "(max-width: 639px) 40px, 56px"}
            loading={eager ? "eager" : "lazy"}
            className={styles.symbolImage}
          />
        </span>
      )}
      <span className={styles.lettering}>
        <Image
          src="/brand/wordmark-v7.png"
          alt="ジシンゴト！"
          fill
          sizes={variant === "wordmark" ? "240px" : variant === "stacked" ? "(max-width: 639px) 90vw, 480px" : "(max-width: 639px) 72vw, 400px"}
          loading={eager ? "eager" : "lazy"}
          className={styles.letteringImage}
        />
      </span>
    </div>
  );
}
