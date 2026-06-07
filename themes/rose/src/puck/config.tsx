import type { Config } from "@measured/puck";
import {
	PuckAuthPanel,
	PuckBurgerPanel,
	PuckCollectionCard,
	PuckCollectionsSection,
	PuckFilterSidebar,
	PuckFiltersRow,
	PuckGallerySection,
	PuckHeroSection,
	PuckModalPopup,
	PuckPopularSection,
	PuckProductCard,
	PuckProductMediaCarousel,
	PuckPromoBanner,
	PuckSwatchDropdown,
	PuckVariantSwatchRow,
	PuckVariantTextRow,
} from "@merfy-dropshipping-platform/design-systems-theme/react/PuckBlocks";

export type Props = {
	Hero: {
		title: string;
		subtitle: string;
		ctaText: string;
		ctaLink: string;
		aboutText: string;
		aboutLink: string;
		backgroundImage: string;
	};
	Collections: {
		title: string;
		subtitle: string;
	};
	Popular: {
		title: string;
		subtitle: string;
	};
	Gallery: {
		title: string;
		subtitle: string;
	};
	PromoBanner: {
		text: string;
		link: string;
		linkText: string;
		textSize: "sm" | "md" | "lg";
	};
	ProductCard: {
		name: string;
		price: string;
		oldPrice: string;
		image: string;
	};
	ProductMedia: Record<string, never>;
	CollectionCard: {
		name: string;
		image: string;
	};
	FiltersRow: { density: "1920" | "1280" };
	FilterSidebar: { density: "1920" | "1280" };
	ModalPopup: {
		title: string;
		subtitle: string;
		dismissLabel: string;
		layout: "1920" | "768" | "375";
	};
	AuthPanel: { title: string; subtitle: string };
	BurgerMenu: Record<string, never>;
	SwatchDropdown: { preview: "circle" | "square" | "none" };
	VariantSwatchRow: { shape: "circle" | "square" };
	VariantTextRow: Record<string, never>;
};

export const config: Config<Props> = {
	components: {
		Hero: {
			label: "Hero Section",
			fields: {
				title: { type: "text", label: "Title" },
				subtitle: { type: "text", label: "Subtitle" },
				ctaText: { type: "text", label: "CTA Button Text" },
				ctaLink: { type: "text", label: "CTA Button Link" },
				aboutText: { type: "text", label: "About Button Text" },
				aboutLink: { type: "text", label: "About Button Link" },
				backgroundImage: { type: "text", label: "Background Image URL" },
			},
			defaultProps: {
				title: "Rose",
				subtitle: "Там, где классика встречается с характером",
				ctaText: "В каталог",
				ctaLink: "#collections",
				aboutText: "О нас",
				aboutLink: "#about",
				backgroundImage: "/images/Главный_экран.png",
			},
			render: (props) => <PuckHeroSection {...props} />,
		},
		Collections: {
			label: "Collections Section",
			fields: {
				title: { type: "text", label: "Title" },
				subtitle: { type: "text", label: "Subtitle" },
			},
			defaultProps: {
				title: "Снова в продаже",
				subtitle: "Стиль для каждой ситуации — найдите свой в каталоге.",
			},
			render: ({ title, subtitle }) => (
				<PuckCollectionsSection title={title} subtitle={subtitle} />
			),
		},
		Popular: {
			label: "Popular Products Section",
			fields: {
				title: { type: "text", label: "Title" },
				subtitle: { type: "text", label: "Subtitle" },
			},
			defaultProps: {
				title: "Популярные",
				subtitle: "Стиль для каждой ситуации — найдите свой в каталоге.",
			},
			render: ({ title, subtitle }) => (
				<PuckPopularSection title={title} subtitle={subtitle} />
			),
		},
		Gallery: {
			label: "Gallery Section",
			fields: {
				title: { type: "text", label: "Title" },
				subtitle: { type: "text", label: "Subtitle" },
			},
			defaultProps: {
				title: "Галерея",
				subtitle: "Стиль для каждой ситуации — найдите свой в каталоге.",
			},
			render: ({ title, subtitle }) => (
				<PuckGallerySection title={title} subtitle={subtitle} />
			),
		},
		PromoBanner: {
			label: "Promo Banner",
			fields: {
				text: { type: "text", label: "Banner Text" },
				link: { type: "text", label: "Link URL" },
				linkText: { type: "text", label: "Link Text" },
				textSize: {
					type: "select",
					label: "Размер текста",
					options: [
						{ label: "Большой (16px)", value: "lg" },
						{ label: "Средний (14px)", value: "md" },
						{ label: "Малый (12px)", value: "sm" },
					],
				},
			},
			defaultProps: {
				text: "Скидка 10% на общую сумму заказа от 9 000₽",
				link: "#",
				linkText: "Перейти",
				textSize: "lg",
			},
			render: ({ text, link, linkText, textSize }) => (
				<PuckPromoBanner
					text={text}
					link={link}
					linkText={linkText}
					textSize={textSize as "sm" | "md" | "lg"}
				/>
			),
		},
		FiltersRow: {
			label: "Filters row",
			fields: {
				density: {
					type: "select",
					label: "Макет",
					options: [
						{ label: "1920 (493:5448)", value: "1920" },
						{ label: "1280 (493:5443)", value: "1280" },
					],
				},
			},
			defaultProps: { density: "1920" },
			render: ({ density }) => <PuckFiltersRow density={density} />,
		},
		FilterSidebar: {
			label: "Filter sidebar",
			fields: {
				density: {
					type: "select",
					label: "Макет",
					options: [
						{ label: "1920 (493:5523)", value: "1920" },
						{ label: "1280 (493:5524)", value: "1280" },
					],
				},
			},
			defaultProps: { density: "1920" },
			render: ({ density }) => <PuckFilterSidebar density={density} />,
		},
		ModalPopup: {
			label: "Modal popup",
			fields: {
				title: { type: "text", label: "Заголовок" },
				subtitle: { type: "text", label: "Подзаголовок" },
				dismissLabel: { type: "text", label: "Текст закрытия" },
				layout: {
					type: "select",
					label: "Кадр",
					options: [
						{ label: "1920 → 614px (494:10771)", value: "1920" },
						{ label: "768 → 432px (494:10839)", value: "768" },
						{ label: "375 → 343px (494:10849)", value: "375" },
					],
				},
			},
			defaultProps: {
				title: "Заголовок",
				subtitle: "Текст",
				dismissLabel: "Скрыть",
				layout: "1920",
			},
			render: (p) => <PuckModalPopup {...p} />,
		},
		BurgerMenu: {
			label: "Burger menu (375)",
			fields: {},
			defaultProps: {},
			render: () => <PuckBurgerPanel />,
		},
		SwatchDropdown: {
			label: "Swatch dropdown",
			fields: {
				preview: {
					type: "select",
					label: "Превью в списке",
					options: [
						{ label: "Круг (494:10669)", value: "circle" },
						{ label: "Квадрат (494:10684)", value: "square" },
						{ label: "Без образца (494:10699)", value: "none" },
					],
				},
			},
			defaultProps: { preview: "circle" },
			render: ({ preview }) => <PuckSwatchDropdown preview={preview} />,
		},
		VariantSwatchRow: {
			label: "Variant swatches (образцы)",
			fields: {
				shape: {
					type: "select",
					label: "Форма",
					options: [
						{ label: "Круг (494:10711)", value: "circle" },
						{ label: "Квадрат (494:10723)", value: "square" },
					],
				},
			},
			defaultProps: { shape: "circle" },
			render: ({ shape }) => <PuckVariantSwatchRow shape={shape} />,
		},
		VariantTextRow: {
			label: "Variant labels — текст (494:10735)",
			fields: {},
			defaultProps: {},
			render: () => <PuckVariantTextRow />,
		},
		AuthPanel: {
			label: "Auth / Login (1920)",
			fields: {
				title: { type: "text", label: "Заголовок" },
				subtitle: { type: "text", label: "Подзаголовок" },
			},
			defaultProps: {
				title: "Заголовок",
				subtitle: "Текст",
			},
			render: (p) => <PuckAuthPanel {...p} />,
		},
		ProductCard: {
			label: "Product Card",
			fields: {
				name: { type: "text", label: "Product Name" },
				price: { type: "text", label: "Price" },
				oldPrice: { type: "text", label: "Old Price" },
				image: { type: "text", label: "Image URL" },
			},
			defaultProps: {
				name: "Сумка",
				price: "5 990₽",
				oldPrice: "7 990₽",
				image: "/images/popular-1.png",
			},
			render: (p) => <PuckProductCard {...p} />,
		},
		ProductMedia: {
			label: "Product media (главное + миниатюры)",
			fields: {},
			defaultProps: {},
			render: () => <PuckProductMediaCarousel />,
		},
		CollectionCard: {
			label: "Collection Card",
			fields: {
				name: { type: "text", label: "Collection Name" },
				image: { type: "text", label: "Image URL" },
			},
			defaultProps: {
				name: "Коллекция RIVIERA",
				image: "/images/sale-1.png",
			},
			render: (p) => <PuckCollectionCard {...p} />,
		},
	},
};

export default config;
