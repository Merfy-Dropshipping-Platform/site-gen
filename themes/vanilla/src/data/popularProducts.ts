import type { Product } from '../types/product';
import { vanillaDemoImage } from './imageAssets';

export const popularProducts: Product[] = [
	{
		id: 'bag-1',
		name: 'Подушки декоративные комплект 2 шт.',
		price: '1 990₽',
		oldPrice: '2 290₽',
		image: vanillaDemoImage(0),
	},
	{
		id: 'bag-2',
		name: 'Ваза Vanilla',
		price: '1 190₽',
		oldPrice: '',
		image: vanillaDemoImage(1),
	},
	{
		id: 'bag-3',
		name: 'Покрывало шерстяное',
		price: '2 590₽',
		oldPrice: '',
		image: vanillaDemoImage(2),
	},
	{
		id: 'bag-4',
		name: 'Мягкий плед',
		price: '2 990₽',
		oldPrice: '',
		image: vanillaDemoImage(3),
	},
];
