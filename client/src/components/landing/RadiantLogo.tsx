import Image from "next/image";

/** Radiant mark — SVG burst + optional raster asset for nav. */
export function RadiantLogo({
  className = "size-7",
  title = "Radiant",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <Image
        src="/radiant-logo-mark.png"
        alt={title}
        width={56}
        height={56}
        className="size-full rounded-full object-cover"
        priority
      />
    </span>
  );
}
