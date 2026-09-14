import { eventCondition } from "@/lib/evac-display";
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
  const condition = eventCondition(event.situation);
  const best = event.choices.reduce<EvacChoice | undefined>((current, item) => !current || item.priority > current.priority ? item : current, undefined);
  const comparison = recommended ?? (best && best.priority > choice.priority ? best : undefined);
  return <div className={styles.review}>
    <figure className={styles.scenario} aria-label="問題の条件">
      <figcaption className={styles.scenarioCaption}>
        <h3 className={styles.conditionHeading}>この場面の条件</h3>
      </figcaption>
      <div className={styles.scenarioContent}>
        <WalkIllustration event={event} className={styles.scenarioImage} />
        <p className={styles.condition}><Furigana text={condition} /></p>
      </div>
    </figure>
    <div className={`${styles.actions} ${comparison ? "" : styles.single}`}>
      {[{ action: choice, label: "選んだ行動" }, ...(comparison ? [{ action: comparison, label: "次に意識したい行動" }] : [])].map(({ action, label }) => <figure key={label} aria-label={label} className={`${styles.action} ${decisionRating(event, action).color}`}>
        <figcaption className={styles.actionHeading}>{label}</figcaption>
        <DecisionRating event={event} choice={action} />
        <WalkIllustration event={event} choice={action} className={styles.actionImage} />
        <p className={styles.actionLabel}><Furigana text={action.label} /></p>
      </figure>)}
    </div>
  </div>;
}
