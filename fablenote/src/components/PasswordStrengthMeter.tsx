import { passwordStrength } from "../lib/passwordStrength";
import { useT } from "../i18n";

const COLORS = ["bg-red-500", "bg-red-400", "bg-amber-400", "bg-green-400", "bg-green-500"];
const TEXT = ["text-red-400", "text-red-400", "text-amber-500", "text-green-500", "text-green-500"];

export default function PasswordStrengthMeter({ value, type }: { value: string; type: "pin" | "alpha" }) {
  const t = useT();
  if (!value) return null;
  const s = passwordStrength(value, type);
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < Math.max(1, s.score) ? COLORS[s.score] : "bg-hover"}`} />
        ))}
      </div>
      <p className="text-[10px] leading-relaxed">
        <span className={`font-medium ${TEXT[s.score]}`}>{t(s.label)}</span>
        {s.hint && <span className="text-muted"> — {t(s.hint)}</span>}
      </p>
    </div>
  );
}
