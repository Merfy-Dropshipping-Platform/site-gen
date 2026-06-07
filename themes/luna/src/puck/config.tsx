import type { Config } from "@measured/puck";

/** WebP + raster fallback (как RosePicture) для React-редактора Puck. */
function PuckRasterPicture({
	src,
	alt,
	className,
	loading = "lazy",
	width,
	height,
	fetchPriority,
}: {
	src: string;
	alt: string;
	className?: string;
	loading?: "lazy" | "eager";
	width?: number | string;
	height?: number | string;
	fetchPriority?: "high" | "low" | "auto";
}) {
	const webp = src.replace(/\.(png|jpe?g)$/i, ".webp");
	const hasWebp = webp !== src;
	return (
		<picture className="contents">
			{hasWebp && <source srcSet={webp} type="image/webp" />}
			<img
				src={src}
				alt={alt}
				width={width}
				height={height}
				loading={loading}
				decoding="async"
				fetchPriority={fetchPriority}
				className={className}
			/>
		</picture>
	);
}

// Определяем типы для наших компонентов
export type Props = {
	Hero: {
		title: string;
		subtitle: string;
		ctaText: string;
		ctaLink: string;
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
	};
	ProductCard: {
		name: string;
		price: string;
		oldPrice: string;
		image: string;
	};
	CollectionCard: {
		name: string;
		image: string;
	};
};

// Конфигурация Puck
export const config: Config<Props> = {
	components: {
		Hero: {
			label: "Hero Section",
			fields: {
				title: {
					type: "text",
					label: "Title",
				},
				subtitle: {
					type: "text",
					label: "Subtitle",
				},
				ctaText: {
					type: "text",
					label: "CTA Button Text",
				},
				ctaLink: {
					type: "text",
					label: "CTA Button Link",
				},
				backgroundImage: {
					type: "text",
					label: "Background Image URL",
				},
			},
			defaultProps: {
				title: "Rose",
				subtitle: "Ваш стиль, ваша индивидуальность",
				ctaText: "В каталог",
				ctaLink: "#collections",
				backgroundImage: "/images/first-section.png",
			},
			render: ({ title, subtitle, ctaText, ctaLink, backgroundImage }) => (
				<section
					className="relative bg-white w-full min-h-[400px] sm:min-h-[500px] md:min-h-[600px] lg:min-h-[700px] xl:min-h-[800px] 2xl:min-h-[1080px] overflow-hidden"
					aria-labelledby="hero-title"
				>
					<div className="w-full max-w-[1920px] mx-auto relative min-h-[60vh] sm:min-h-[65vh] md:min-h-[70vh] lg:min-h-[75vh] xl:min-h-[80vh]">
						<PuckRasterPicture
							src={backgroundImage}
							alt="Hero background"
							loading="eager"
							fetchPriority="high"
							className="absolute inset-0 z-0 size-full object-cover object-center"
						/>
						<div className="relative z-10 w-full h-full flex items-center justify-center py-8 sm:py-12 md:py-16 lg:py-20 xl:py-24">
							<div className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 lg:gap-[20px] xl:gap-[25px] px-4 sm:px-6 md:px-8 w-full max-w-7xl">
								<header className="flex flex-col items-center gap-1 sm:gap-2 md:gap-3 lg:gap-4 xl:gap-[5px]">
									<h1
										id="hero-title"
										className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-[48px] font-normal text-white uppercase leading-[1.115] text-center font-comfortaa"
									>
										{title}
									</h1>
									<p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-[24px] font-normal text-white leading-[1.366] text-center px-2 sm:px-4 md:px-6 lg:px-8 font-manrope">
										{subtitle}
									</p>
								</header>
								<div>
									<a
										href={ctaLink}
										className="bg-white text-black rounded-lg sm:rounded-[8px] md:rounded-[10px] px-6 sm:px-8 md:px-[25px] lg:px-[30px] xl:px-[35px] h-12 sm:h-14 md:h-16 lg:h-[70px] xl:h-[80px] flex items-center justify-center gap-2 sm:gap-[8px] md:gap-[10px] text-sm sm:text-base md:text-lg lg:text-xl xl:text-[24px] font-normal uppercase leading-[1.366] hover:bg-gray-100 transition-colors font-manrope"
									>
										{ctaText}
									</a>
								</div>
							</div>
						</div>
					</div>
				</section>
			),
		},
		Collections: {
			label: "Collections Section",
			fields: {
				title: {
					type: "text",
					label: "Title",
				},
				subtitle: {
					type: "text",
					label: "Subtitle",
				},
			},
			defaultProps: {
				title: "Снова в продаже",
				subtitle: "Стиль для каждой ситуации - найдите свой в каталоге.",
			},
			render: ({ title, subtitle }) => (
				<div>
					<p>Collections Section: {title}</p>
					<p>{subtitle}</p>
				</div>
			),
		},
		Popular: {
			label: "Popular Products Section",
			fields: {
				title: {
					type: "text",
					label: "Title",
				},
				subtitle: {
					type: "text",
					label: "Subtitle",
				},
			},
			defaultProps: {
				title: "Популярные",
				subtitle: "Стиль для каждой ситуации - найдите свой в каталоге.",
			},
			render: ({ title, subtitle }) => (
				<div>
					<p>Popular Section: {title}</p>
					<p>{subtitle}</p>
				</div>
			),
		},
		Gallery: {
			label: "Gallery Section",
			fields: {
				title: {
					type: "text",
					label: "Title",
				},
				subtitle: {
					type: "text",
					label: "Subtitle",
				},
			},
			defaultProps: {
				title: "Галерея",
				subtitle: "Стиль для каждой ситуации - найдите свой в каталоге.",
			},
			render: ({ title, subtitle }) => (
				<div>
					<p>Gallery Section: {title}</p>
					<p>{subtitle}</p>
				</div>
			),
		},
		PromoBanner: {
			label: "Promo Banner",
			fields: {
				text: {
					type: "text",
					label: "Banner Text",
				},
				link: {
					type: "text",
					label: "Link URL",
				},
				linkText: {
					type: "text",
					label: "Link Text",
				},
			},
			defaultProps: {
				text: "Скидка 10% на общую сумму заказа от 9 000₽",
				link: "#",
				linkText: "Перейти",
			},
			render: ({ text, link, linkText }) => (
				<div className="bg-black text-white w-full py-2 sm:py-2.5 md:py-3 lg:py-3.5 xl:py-4">
					<div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16">
						<a
							href={link}
							className="block text-center hover:opacity-80 transition-opacity text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl font-normal leading-tight font-manrope"
						>
							<span className="inline-block">{text}</span>
							<span className="inline-block ml-1 sm:ml-2 md:ml-3 lg:ml-4 underline decoration-1 underline-offset-2">
								{linkText}
							</span>
						</a>
					</div>
				</div>
			),
		},
		ProductCard: {
			label: "Product Card",
			fields: {
				name: {
					type: "text",
					label: "Product Name",
				},
				price: {
					type: "text",
					label: "Price",
				},
				oldPrice: {
					type: "text",
					label: "Old Price",
				},
				image: {
					type: "text",
					label: "Image URL",
				},
			},
			defaultProps: {
				name: "Сумка",
				price: "5 990₽",
				oldPrice: "7 990₽",
				image: "/images/popular-1.png",
			},
			render: ({ name, price, oldPrice, image }) => (
				<article className="flex flex-col gap-4 sm:gap-5 md:gap-6 lg:gap-[25px] group cursor-pointer">
					<div className="bg-gray-100 rounded-lg sm:rounded-[8px] md:rounded-[10px] overflow-hidden w-full aspect-[318/515]">
						<PuckRasterPicture
							src={image}
							alt={name}
							loading="lazy"
							className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
						/>
					</div>
					<div className="flex flex-col gap-2 sm:gap-2.5 md:gap-3 lg:gap-[10px] px-2 sm:px-3 md:px-4 lg:px-[15px]">
						<h3 className="text-base sm:text-lg md:text-xl lg:text-[24px] font-normal text-black leading-[1.366] font-manrope">
							{name}
						</h3>
						<div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-[15px] flex-wrap">
							<span className="text-lg sm:text-xl md:text-2xl lg:text-[32px] font-normal text-black leading-[1.366] font-manrope">
								{price}
							</span>
							<span className="text-sm sm:text-base md:text-lg lg:text-[20px] font-medium text-[#999999] line-through leading-[1.366] font-manrope">
								{oldPrice}
							</span>
						</div>
					</div>
				</article>
			),
		},
		CollectionCard: {
			label: "Collection Card",
			fields: {
				name: {
					type: "text",
					label: "Collection Name",
				},
				image: {
					type: "text",
					label: "Image URL",
				},
			},
			defaultProps: {
				name: "Коллекция RIVIERA",
				image: "/images/sale-1.png",
			},
			render: ({ name, image }) => (
				<article className="group cursor-pointer" role="listitem" aria-label={`Коллекция ${name}`}>
					<div className="relative w-full aspect-[430/500] bg-gray-100 rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-5 md:mb-6 lg:mb-8 shadow-sm hover:shadow-lg transition-shadow duration-300">
						<PuckRasterPicture
							src={image}
							alt={`Изображение коллекции ${name}`}
							className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
							loading="lazy"
							width="430"
							height="500"
						/>
						<div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300"></div>
					</div>
					<div className="px-1 sm:px-2">
						<h3 className="text-lg sm:text-xl md:text-2xl lg:text-[24px] font-normal text-black group-hover:text-gray-700 transition-colors duration-200 font-manrope">
							{name}
						</h3>
					</div>
				</article>
			),
		},
	},
};

export default config;
