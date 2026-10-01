export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 4h17a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9L3 16Z" fill="#E3A82B" />
      <circle cx="9.5" cy="16" r="2.2" fill="#F2EEE3" />
      <path d="M15 11.5h9M15 16h7M15 20.5h9" stroke="#17201B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <LogoMark size={size} />
      <span
        className="display"
        style={{ fontSize: size * 0.68, fontWeight: 800, color: light ? "#fffdf8" : "var(--ink)", letterSpacing: "-0.03em" }}
      >
        закупка
      </span>
    </span>
  );
}
