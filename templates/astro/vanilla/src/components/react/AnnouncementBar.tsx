import React from "react";

interface AnnouncementBarProps {
  text?: string;
  link?: { href?: string } | string;
  size?: string;
  colorScheme?: string;
}

const sizeClasses: Record<string, string> = {
  small: "h-[36px] md:h-[48px] text-[14px] md:text-[16px]",
  medium: "h-[36px] md:h-[48px] text-[14px] md:text-[16px]",
  large: "h-[40px] md:h-[48px] text-[16px]",
};

export function AnnouncementBar({
  text = "10% discount on orders over 9,000 RUB",
  link,
  size = "small",
  colorScheme,
}: AnnouncementBarProps) {
  const href =
    typeof link === "object" ? (link as any)?.href : link || "#";
  const sizeClass = sizeClasses[size] || sizeClasses.small;
  const schemeClass = colorScheme ? `color-scheme-${colorScheme.replace('scheme-', '')}` : '';

  return (
    <div className={`w-full flex items-center justify-center ${sizeClass} ${schemeClass}`} style={{ backgroundColor: 'rgb(var(--color-background))', color: 'rgb(var(--color-foreground))' }}>
      <div className="w-full max-w-[1320px] mx-auto px-5">
        <a
          href={href}
          className="block text-center hover:opacity-80 transition-opacity font-normal leading-tight uppercase"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <span className="inline-block">{text}</span>
        </a>
      </div>
    </div>
  );
}

export default AnnouncementBar;
