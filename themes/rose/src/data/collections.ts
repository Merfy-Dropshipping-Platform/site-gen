export interface Collection {
	id: string;
	name: string;
	image: string;
}

export const collections: Collection[] = [
	{
		id: 'riviera',
		name: 'Коллекция RIVIERA',
		image: '/images/Коллекция_1.png',
	},
	{
		id: 'urban',
		name: 'Коллекция URBAN',
		image: '/images/Коллекция_2.png',
	},
	{
		id: 'futurism',
		name: 'Коллекция FUTURISM',
		image: '/images/Коллекция_3.png',
	},
];
