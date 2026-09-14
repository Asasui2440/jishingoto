import type { EvacChoice, HazardEvent } from "@/lib/evac-content";
import { Furigana } from "@/components/ui/Furigana";
import { DecisionRating, decisionRating } from "./DecisionRating";
import { WalkIllustration } from "./WalkIllustration";
import styles from "./ReviewIllustrations.module.css";

/** Shared grid rows align both actions even when their titles or ratings wrap. */
export function ReviewIllustrations({ event, choice, recommended }: {
  event: HazardEvent;
  choice: EvacChoice;
  recommended?: EvacChoice;
}) {
  const condition = event.situation.replace("【想定問題】", "").replace(/\nこの条件では、まずどうしますか？$/, "");
  return <div className={styles.review}>
    <figure className={styles.scenario} aria-label="問題の条件">
      <WalkIllustration event={event} className={styles.scenarioImage} />
      <figcaption>
        <h3 className={styles.conditionHeading}>この場面の条件</h3>
        <p className={styles.condition}><Furigana text={condition} /></p>
      </figcaption>
    </figure>
    <div className={`${styles.actions} ${recommended ? "" : styles.single}`}>
      {[{ action: choice, label: "選んだ行動" }, ...(recommended ? [{ action: recommended, label: "次に意識したい行動" }] : [])].map(({ action, label }) => <figure key={label} aria-label={label} className={`${styles.action} ${decisionRating(event, action).color}`}>
        <figcaption className={styles.actionHeading}>{label}</figcaption>
        <DecisionRating event={event} choice={action} />
        <WalkIllustration event={event} choice={action} className={styles.actionImage} />
        <p className={styles.actionLabel}><Furigana text={action.label} /></p>
      </figure>)}
    </div>
  </div>;
}
