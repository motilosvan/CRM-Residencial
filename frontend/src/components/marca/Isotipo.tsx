interface Props {
  className?: string;
  /** Decorativo cuando acompaña al texto. */
  decorativo?: boolean;
}

/** Sobre cuya solapa es un trazo de flujo. Tinta: currentColor; detalle ámbar: var(--acento). */
export function Isotipo({ className = 'size-8', decorativo = true }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden={decorativo ? true : undefined}
      role={decorativo ? undefined : 'img'}
      aria-label={decorativo ? undefined : 'MailFlow'}
    >
      <rect x="3" y="6" width="26" height="20" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M5 11c4 0 5.5 8 11 8s7-8 11-8"
        stroke="var(--acento)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
