export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{
		id: "hydro",
		name: "HYDRO",
		image: "/images/trend-1.webp",
	},
	{
		id: "daily",
		name: "DAILY",
		image: "/images/trend-2.webp",
	},
	{
		id: "lift",
		name: "LIFT",
		image: "/images/trend-3.webp",
	},
];
