import { type ReactNode, useId, useState } from 'react';
import { GLOSSARY, type TermId } from './glossary.ts';

/** A word with a dotted underline that explains itself on hover, focus or tap. */
export function Term({ id, children }: { id: TermId; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span
      className="term"
      tabIndex={0}
      role="button"
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      {children}
      {open && (
        <span className="term-tip" role="tooltip" id={tipId}>
          {GLOSSARY[id]}
        </span>
      )}
    </span>
  );
}
