import React from "react";

interface AnnouncementBarProps {
  text?: string;
  link?: { href?: string } | string;
  size?: string;
  colorScheme?: string;
}

const sizeClasses: Record<string, string> = {
  small: "h-[32px] md:h-[44px] lg:h-[48px] text-[14px]",
  medium: "h-[32px] md:h-[44px] lg:h-[48px] text-[14px]",
  large: "h-[32px] md:h-[44px] lg:h-[48px] text-[16px]",
};

export function AnnouncementBar({
  text = "10% discount on orders over 9,000 RUB",
  link,
  size = "small",
}: AnnouncementBarProps) {
  const href =
    typeof link === "object" ? (link as any)?.href : link || "#";
  const sizeClass = sizeClasses[size] || sizeClasses.small;

  return (
    <div className={`w-full flex items-center justify-center ${sizeClass}`} style={{ backgroundColor: 'rgb(var(--color-background))', color: 'rgb(var(--color-foreground))' }}>
      <div className="w-full max-w-[1320px] mx-auto px-4 md:px-6">
        <a
          href={href}
          className="block text-center hover:opacity-80 transition-opacity font-normal leading-tight"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <span className="inline-block">{text}</span>
        </a>
      </div>
    </div>
  );
}

export default AnnouncementBar;
