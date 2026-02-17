import React from "react";

interface ImageWithTextProps {
  image?: string;
  size?: "small" | "medium" | "large";
  width?: "small" | "medium" | "large";
  photoPosition?: "left" | "right";
  heading?: { enabled?: string; text?: string };
  text?: { enabled?: string; content?: string };
  button?: { enabled?: string; text?: string; link?: string };
  colorScheme?: string;
  padding?: { top?: number; bottom?: number };
}

export function ImageWithText({
  image,
  size = "medium",
  photoPosition = "left",
  heading,
  text,
  button,
  padding,
}: ImageWithTextProps) {
  const padTop = padding?.top ?? 80;
  const padBottom = padding?.bottom ?? 80;
  const showHeading = heading?.enabled !== "false" && heading?.text;
  const showText = text?.enabled !== "false" && text?.content;
  const showButton = button?.enabled !== "false" && button?.text;

  const headingSizeMap: Record<string, string> = {
    small: "text-2xl",
    medium: "text-3xl",
    large: "text-4xl",
  };

  return (
    <section
      className={`max-w-[1200px] mx-auto px-5`}
      style={{ paddingTop: `${padTop}px`, paddingBottom: `${padBottom}px` }}
    >
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-[60px] items-center`}
      >
        {/* Image */}
        <div
          className={photoPosition === "right" ? "order-1 md:order-2" : ""}
        >
          {image ? (
            <img
              src={image}
              alt={heading?.text ?? ""}
              loading="lazy"
              className="w-full h-auto rounded-2xl object-cover"
            />
          ) : (
            <div className="aspect-[4/3] bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21,15 16,10 5,21" />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div
          className={photoPosition === "right" ? "order-2 md:order-1" : ""}
        >
          {showHeading && (
            <h2
              className={`${headingSizeMap[size] || "text-3xl"} font-medium text-gray-900 mb-4 leading-[1.2] font-comfortaa`}
            >
              {heading!.text}
            </h2>
          )}
          {showText && (
            <p className="text-lg text-gray-600 leading-[1.7] mb-6 font-manrope">
              {text!.content}
            </p>
          )}
          {showButton && (
            <a
              href={button!.link ?? "#"}
              className="inline-flex items-center px-8 py-3.5 text-[0.95rem] font-medium rounded-lg bg-black text-white no-underline hover:bg-gray-800 transition-colors font-manrope"
            >
              {button!.text}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export default ImageWithText;
