export type RoseSlidePosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type RoseMultiRowsButtonStyle = "primary" | "black" | "white";

type RoseSize = "small" | "medium" | "large";
type RosePromoBannerSize = "thin" | RoseSize;

const SLIDE_POSITIONS = new Set<RoseSlidePosition>([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

const FOOTER_TEXT: Record<RoseSize, string> = {
  small: "!text-[14px]",
  medium: "!text-[15px]",
  large: "!text-[16px]",
};

const PROMO_BANNER: Record<
  RosePromoBannerSize,
  { minHeightClass: string; textClass: string }
> = {
  thin: { minHeightClass: "min-h-8", textClass: "text-[12px]" },
  small: { minHeightClass: "min-h-8", textClass: "text-[12px]" },
  medium: { minHeightClass: "min-h-10", textClass: "text-[14px]" },
  large: { minHeightClass: "min-h-12", textClass: "text-[16px]" },
};

function isRoseSize(value: unknown): value is RoseSize {
  return value === "small" || value === "medium" || value === "large";
}

export function normalizeRoseSlidePosition(value: unknown): RoseSlidePosition {
  if (value === "left") return "center-left";
  if (value === "right") return "center-right";
  return typeof value === "string" &&
    SLIDE_POSITIONS.has(value as RoseSlidePosition)
    ? (value as RoseSlidePosition)
    : "center";
}

export function roseFooterHeadingStyle(value: unknown): string {
  const size = isRoseSize(value) ? value : "medium";
  const mobile = size === "small" ? "12px" : size === "large" ? "17px" : "14px";
  const desktop =
    size === "small" ? "17px" : size === "large" ? "24px" : "20px";
  return `--size-section-heading:${desktop};--size-section-heading-m:${mobile};`;
}

export function roseFooterTextClass(value: unknown): string {
  return FOOTER_TEXT[isRoseSize(value) ? value : "large"];
}

export function normalizeRoseMultiRowsButtonStyle(
  value: unknown,
): RoseMultiRowsButtonStyle {
  if (value === "white" || value === "secondary") return "white";
  if (value === "black") return "black";
  return "primary";
}

export function rosePromoBannerSize(value: unknown): {
  minHeightClass: string;
  textClass: string;
} {
  const size = value === "thin" || isRoseSize(value) ? value : "large";
  return PROMO_BANNER[size];
}
