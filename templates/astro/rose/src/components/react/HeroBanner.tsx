import React from "react";

interface HeroBannerProps {
  heading?: { text?: string; size?: string } | string;
  text?: { content?: string; size?: string } | string;
  primaryButton?: { text?: string; link?: { href?: string } | string };
  secondaryButton?: { text?: string; link?: { href?: string } | string };
  overlay?: number;
  backgroundImage?: string;
  backgroundImage2?: string;
  size?: string;
  position?: string;
  alignment?: string;
  container?: string;
  colorScheme?: string;
}

const sizeClasses: Record<string, string> = {
  small: "min-h-[300px] sm:min-h-[350px] md:min-h-[400px]",
  medium: "min-h-[400px] sm:min-h-[500px] md:min-h-[600px]",
  large:
    "min-h-[400px] sm:min-h-[500px] md:min-h-[600px] lg:min-h-[700px] xl:min-h-[800px] 2xl:min-h-[1080px]",
};

const positionMap: Record<string, string> = {
  "top-left": "items-start justify-start text-left",
  "top-center": "items-start justify-center text-center",
  "top-right": "items-start justify-end text-right",
  "center-left": "items-center justify-start text-left",
  center: "items-center justify-center text-center",
  "center-right": "items-center justify-end text-right",
  "bottom-left": "items-end justify-start text-left",
  "bottom-center": "items-end justify-center text-center",
  "bottom-right": "items-end justify-end text-right",
};

export function HeroBanner({
  heading = { text: "Rose", size: "medium" },
  text = { content: "Your style, your individuality", size: "medium" },
  primaryButton = { text: "View catalog", link: { href: "#collections" } },
  secondaryButton = { text: "", link: { href: "#" } },
  overlay = 10,
  backgroundImage = "/images/first-section.png",
  size = "large",
  position = "center",
}: HeroBannerProps) {
  const headingText =
    typeof heading === "object" ? heading?.text : heading;
  const textContent =
    typeof text === "object" ? (text as any)?.content : text;
  const primaryLink =
    typeof primaryButton?.link === "object"
      ? (primaryButton?.link as any)?.href
      : primaryButton?.link || "#";
  const secondaryLink =
    typeof secondaryButton?.link === "object"
      ? (secondaryButton?.link as any)?.href
      : secondaryButton?.link || "#";

  const sizeClass = sizeClasses[size || "large"] || sizeClasses.large;
  const posClass = positionMap[position || "center"] || positionMap.center;
  const overlayOpacity = (overlay || 0) / 100;

  const alignItems = (position || "center").includes("left")
    ? "items-start"
    : (position || "center").includes("right")
      ? "items-end"
      : "items-center";

  return (
    <section className={`relative bg-white w-full ${sizeClass} overflow-hidden`}>
      <div className="w-full max-w-[1920px] mx-auto relative min-h-[60vh] sm:min-h-[65vh] md:min-h-[70vh] lg:min-h-[75vh] xl:min-h-[80vh]">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('${backgroundImage}')` }}
        />

        {/* Overlay */}
        {overlayOpacity > 0 && (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
          />
        )}

        {/* Content */}
        <div
          className={`relative z-10 w-full h-full flex ${posClass} py-8 sm:py-12 md:py-16 lg:py-20 xl:py-24`}
        >
          <div className={`flex flex-col ${alignItems} gap-4 sm:gap-5 md:gap-6 lg:gap-[20px] xl:gap-[25px] px-4 sm:px-6 md:px-8 w-full max-w-7xl`}>
            <header className={`flex flex-col ${alignItems} gap-1 sm:gap-2 md:gap-3 lg:gap-4 xl:gap-[5px]`}>
              {headingText && (
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-[48px] font-normal text-white uppercase leading-[1.115] text-center font-comfortaa">
                  {headingText}
                </h1>
              )}
              {textContent && (
                <p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-[24px] font-normal text-white leading-[1.366] text-center px-2 sm:px-4 md:px-6 lg:px-8 font-manrope">
                  {textContent}
                </p>
              )}
            </header>

            <div className="flex gap-4">
              {primaryButton?.text && (
                <a
                  href={primaryLink}
                  className="bg-white text-black rounded-lg sm:rounded-[8px] md:rounded-[10px] px-6 sm:px-8 md:px-[25px] lg:px-[30px] xl:px-[35px] h-12 sm:h-14 md:h-16 lg:h-[70px] xl:h-[80px] flex items-center justify-center gap-2 sm:gap-[8px] md:gap-[10px] text-sm sm:text-base md:text-lg lg:text-xl xl:text-[24px] font-normal uppercase leading-[1.366] hover:bg-gray-100 transition-colors font-manrope"
                >
                  {primaryButton.text}
                </a>
              )}
              {secondaryButton?.text && (
                <a
                  href={secondaryLink}
                  className="border border-white text-white rounded-lg sm:rounded-[8px] md:rounded-[10px] px-6 sm:px-8 md:px-[25px] h-12 sm:h-14 md:h-16 lg:h-[70px] xl:h-[80px] flex items-center justify-center text-sm sm:text-base md:text-lg lg:text-xl xl:text-[24px] font-normal uppercase leading-[1.366] hover:bg-white/10 transition-colors font-manrope"
                >
                  {secondaryButton.text}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroBanner;
