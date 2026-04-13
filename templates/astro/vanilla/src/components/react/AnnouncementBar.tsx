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
    <div className={`w-full flex items-center justify-center ${sizeClass}`} style={{ backgroundColor: '#26311c', color: '#ffffff' }}>
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8 lg:px-16 xl:px-24 2xl:px-[300px]">
        <a
          href={href}
          className="block text-center hover:opacity-80 transition-opacity font-normal leading-tight font-body"
        >
          <span className="inline-block">{text}</span>
        </a>
      </div>
    </div>
  );
}

export default AnnouncementBar;
