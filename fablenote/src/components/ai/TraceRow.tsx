interface Props {
  label: string;
  value: string;
  dim?: boolean;
}

export function TraceRow({ label, value, dim }: Props) {
  return (
    <div className="flex items-start gap-2 font-mono text-[10px]">
      <span className="text-muted shrink-0 w-12">{label}</span>
      <span className={dim ? "text-muted" : "text-secondary break-all"}>{value}</span>
    </div>
  );
}
