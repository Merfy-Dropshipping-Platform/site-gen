export type RoseHeadingSize = "small" | "medium" | "large";
export type HeadingSizePrecedence = "top-level" | "nested";

const HEADING_SIZES: Record<
	RoseHeadingSize,
	{ desktop: string; mobile: string }
> = {
	small: { desktop: "17px", mobile: "12px" },
	medium: { desktop: "20px", mobile: "14px" },
	large: { desktop: "24px", mobile: "17px" },
};

function isRoseHeadingSize(value: unknown): value is RoseHeadingSize {
	return value === "small" || value === "medium" || value === "large";
}

export function resolveRoseHeadingSize(
	topLevel: unknown,
	nested: unknown,
	precedence: HeadingSizePrecedence,
): RoseHeadingSize {
	const candidates =
		precedence === "top-level" ? [topLevel, nested] : [nested, topLevel];

	return candidates.find(isRoseHeadingSize) ?? "medium";
}

export function roseHeadingStyle(
	prefix: string,
	size: RoseHeadingSize,
): string {
	const values = HEADING_SIZES[size];

	return `--${prefix}-heading-size:${values.desktop};--${prefix}-heading-size-mobile:${values.mobile};`;
}
