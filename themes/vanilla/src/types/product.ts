export interface Product {
	name: string;
	price: string;
	oldPrice?: string;
	image: string;
	id?: string;
	discount?: boolean;
	colors?: string[];
}
