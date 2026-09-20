import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('border-b bg-card px-4 py-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          {/*
            Auf dem Handy darf der Titel umbrechen. „Änderungen & …" sagt
            weniger als nichts - man weiss nicht einmal, ob man richtig ist.
          */}
          <h1 className="text-base font-semibold leading-tight md:truncate">{title}</h1>
          {description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground md:line-clamp-none md:truncate">
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
