// Small stroke icon set (inline SVG, no icon font or CDN).
const paths: Record<string, string> = {
  portfolio: "M4 7h16v12H4zM8 7V5h8v2M4 12h16",
  watch: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  lookup: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20M8 10.5h5",
  send: "M4 12 20 4l-6 16-3-7-7-1z",
  spy: "M3 5h18M6 5l1.5 6h9L18 5M7 15a3 3 0 1 0 0 .01M17 15a3 3 0 1 0 0 .01M10 15h4",
  network: "M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  swap: "M7 7h11l-3-3M17 17H6l3 3",
  in: "M12 4v14M6 12l6 6 6-6",
  out: "M12 20V6M6 12l6-6 6 6",
  check: "M5 12.5 10 17l9-10",
  plus: "M12 5v14M5 12h14",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20h4",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13",
};

export default function Icon({ name, label }: { name: keyof typeof paths | string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <path d={paths[name] ?? ""} />
    </svg>
  );
}
