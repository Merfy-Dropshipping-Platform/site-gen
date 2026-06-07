import { V_IMG } from "./imageAssets";

export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{
		id: 'riviera',
		name: 'Текстиль и постельные принадлежности',
		image: V_IMG.collectionTextile,
	},
	{
		id: 'urban',
		name: 'Декор и предметы интерьера',
		image: V_IMG.collectionDecor,
	},
	{
		id: 'futurism',
		name: 'Домашние акценты',
		image: V_IMG.hero(3),
	},
];
