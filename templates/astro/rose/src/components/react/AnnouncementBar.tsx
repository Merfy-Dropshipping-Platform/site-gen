import React from "react";

interface AnnouncementBarProps {
  text?: string;
  link?: { href?: string } | string;
  size?: string;
  colorScheme?: string;
}

const sizeClasses: Record<string, string> = {
  small: "py-2 sm:py-2.5 md:py-3 text-xs sm:text-sm md:text-base",
  medium: "py-3 sm:py-3.5 md:py-4 text-sm sm:text-base md:text-lg",
  large: "py-4 sm:py-4.5 md:py-5 text-base sm:text-lg md:text-xl",
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
    <div className={`bg-black text-white w-full ${sizeClass}`}>
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16">
        <a
          href={href}
          className="block text-center hover:opacity-80 transition-opacity font-normal leading-tight font-manrope"
        >
          <span className="inline-block">{text}</span>
        </a>
      </div>
    </div>
  );
}

export default AnnouncementBar;
