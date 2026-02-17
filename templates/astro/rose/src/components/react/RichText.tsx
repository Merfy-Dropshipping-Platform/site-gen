import React from "react";

interface RichTextProps {
  heading?: string | { text?: string; size?: string };
  text?: string | { text?: string };
  button?: { text?: string; link?: { href?: string } | string };
  align?: "left" | "center" | "right";
  size?: "small" | "medium" | "large";
  padding?: { top?: number; bottom?: number };
}

const sizeClasses: Record<string, string> = {
  small: "max-w-[800px]",
  medium: "max-w-[800px]",
  large: "max-w-[800px]",
};

const headingSizeClasses: Record<string, string> = {
  small: "text-2xl",
  medium: "text-[2rem]",
  large: "text-[2.5rem]",
};

const textSizeClasses: Record<string, string> = {
  small: "text-base",
  medium: "text-lg",
  large: "text-xl",
};

export function RichText({
  heading,
  text,
  button,
  align = "center",
  size = "medium",
  padding,
}: RichTextProps) {
  const headingText =
    typeof heading === "object" ? heading?.text : heading;
  const bodyText = typeof text === "object" ? (text as any)?.text : text;
  const headingSize =
    typeof heading === "object" ? heading?.size : size;
  const resolvedSize = (headingSize ?? size ?? "medium") as string;
  const padTop = padding?.top ?? 60;
  const padBottom = padding?.bottom ?? 60;

  const buttonLink =
    typeof button?.link === "object"
      ? (button?.link as any)?.href
      : button?.link || "#";

  return (
    <section
      className={`${sizeClasses[resolvedSize] || sizeClasses.medium} mx-auto px-5`}
      style={{
        textAlign: align as any,
        paddingTop: `${padTop}px`,
        paddingBottom: `${padBottom}px`,
      }}
    >
      {headingText && (
        <h2
          className={`${headingSizeClasses[resolvedSize] || headingSizeClasses.medium} font-medium text-gray-900 mb-5 leading-[1.2] font-comfortaa`}
        >
          {headingText}
        </h2>
      )}
      {bodyText && (
        <p
          className={`${textSizeClasses[resolvedSize] || textSizeClasses.medium} text-gray-600 leading-[1.7] font-manrope`}
        >
          {bodyText}
        </p>
      )}
      {button?.text && (
        <a
          href={buttonLink}
          className="inline-flex items-center mt-6 px-8 py-3.5 text-[0.95rem] font-medium rounded-lg bg-black text-white no-underline hover:bg-gray-800 transition-colors font-manrope"
        >
          {button.text}
        </a>
      )}
    </section>
  );
}

export default RichText;
