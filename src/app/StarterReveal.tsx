import { useCallback } from "react";
import "./starterReveal.css";

type StarterRevealProps = {
  label: string;
  buttonLabel: string;
  title: string;
  onAcknowledge: () => void;
};

export function StarterReveal({ label, buttonLabel, title, onAcknowledge }: StarterRevealProps) {
  const handleStart = useCallback(() => {
    onAcknowledge();
  }, [onAcknowledge]);

  return (
    <div className="starter-reveal-overlay starter-reveal-visible" role="dialog" aria-modal="true" aria-labelledby="starter-reveal-title">
      <div className="starter-reveal-card">
        <div className="starter-reveal-versus" aria-hidden="true">
          <span />
          <span />
        </div>
        <h2 id="starter-reveal-title">{title}</h2>
        <div className="starter-reveal-result">
          <div className="starter-reveal-player">{label}</div>
        </div>
        <button className="starter-reveal-button" type="button" onClick={handleStart} autoFocus>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
