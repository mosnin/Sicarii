import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon className="mb-4 h-8 w-8 text-fg-light" strokeWidth={1.4} />
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className="max-w-xs text-sm text-fg-tertiary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
