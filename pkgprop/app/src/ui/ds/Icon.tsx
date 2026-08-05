/** Minimal 16×16 stroke icon set. One weight, square joins — panel hardware. */

const PATHS: Record<string, React.ReactNode> = {
  undo: (
    <>
      <path d="M6 3 L2.5 6.5 L6 10" />
      <path d="M2.5 6.5 H10 a3.5 3.5 0 0 1 0 7 H6" />
    </>
  ),
  redo: (
    <>
      <path d="M10 3 L13.5 6.5 L10 10" />
      <path d="M13.5 6.5 H6 a3.5 3.5 0 0 0 0 7 h4" />
    </>
  ),
  reset: (
    <>
      <path d="M13.5 8 a5.5 5.5 0 1 1 -1.6 -3.9" />
      <path d="M13.5 2.5 V4.5 H11.5" />
    </>
  ),
  fit: (
    <>
      <path d="M2.5 5.5 V2.5 H5.5" />
      <path d="M10.5 2.5 H13.5 V5.5" />
      <path d="M13.5 10.5 V13.5 H10.5" />
      <path d="M5.5 13.5 H2.5 V10.5" />
      <rect x="6" y="6" width="4" height="4" />
    </>
  ),
  save: (
    <>
      <path d="M8 2.5 V10" />
      <path d="M5 7.5 L8 10.5 L11 7.5" />
      <path d="M2.5 13.5 H13.5" />
    </>
  ),
  load: (
    <>
      <path d="M8 10.5 V3" />
      <path d="M5 5.5 L8 2.5 L11 5.5" />
      <path d="M2.5 13.5 H13.5" />
    </>
  ),
  ledger: (
    <>
      <path d="M3 3 H13" />
      <path d="M3 6.5 H13" />
      <path d="M3 10 H9" />
      <path d="M3 13 H11" />
    </>
  ),
  engine: (
    <>
      <rect x="3" y="5" width="9" height="7" />
      <path d="M5 5 V3 H10 V5" />
      <path d="M12 8 H14.5" />
      <path d="M3 9 H1.5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS & string;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function IconButton({
  name,
  label,
  onClick,
  disabled,
  testid,
}: {
  name: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <button
      className="icon-btn"
      title={label}
      aria-label={label}
      disabled={disabled ?? false}
      data-testid={testid}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
