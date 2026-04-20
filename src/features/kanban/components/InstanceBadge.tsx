interface InstanceBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function InstanceBadge({ name, color, className }: InstanceBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full${className ? ` ${className}` : ''}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}
