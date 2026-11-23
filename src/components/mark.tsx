type DanMarkProps = {
  size?: number;
  title?: string;
  className?: string;
};

/**
 * Vermilion square, a blocky 單, and a receipt where the last stroke falls.
 * Keep the geometry in sync with src/app/icon.svg.
 */
export function DanMark({ size = 48, title, className }: DanMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="64" height="64" rx="14" fill="#B83A2E" />
      <path
        fill="#FFFDF8"
        fillRule="evenodd"
        d="M14 7h16v12H14zm3 3h10v6H17zm17-3h16v12H34zm3 3h10v6H37z"
      />
      <path
        fill="#FFFDF8"
        fillRule="evenodd"
        d="M14 22h36v20H14zm3 3h14v6H17zm16 0h14v6H33zM17 33h14v6H17zm16 0h14v6H33z"
      />
      <path fill="#FFFDF8" d="M7 45h50v3.5H7z" />
      <path fill="#FFFDF8" d="M25 46.5h14V56l-2.5-1.7L34 56l-2.5-1.7L29 56l-2.5-1.7L25 56z" />
      <path
        d="M27.3 50.2H36.4M27.3 52.7H33.2"
        stroke="#B83A2E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
