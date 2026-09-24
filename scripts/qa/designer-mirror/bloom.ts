import type { Mirror } from "./index";

/** Главная bloom.merfy.ru (Bloom-theme @5aae2ad6, src/pages/index.astro). */
const IMG = "https://bloom.merfy.ru/images";

export const bloom: Mirror = {
  refUrl: "https://bloom.merfy.ru/",
  liveCss: "https://f7593c5f8f8f.merfy.ru/_astro/_slug_.BCulF5DE.css",
  assetBase: "https://f7593c5f8f8f.merfy.ru/",
  catalog: { products: [], collections: [], publications: [] },
  sections: [
    {
      name: "hero",
      blocks: ["Hero"],
      refIndex: 1,
      props: {
        Hero: {
          id: "Hero-1",
          heading: { text: "Искусство заботы о себе" },
          text: { content: "Уходовая косметика, которая дарит здоровье и сияние вашей коже и волосам" },
          primaryButton: { text: "Начать ритуал", link: { href: "/catalog" } },
          backgroundImages: { url1: `${IMG}/hero-photo.webp` },
        },
      },
    },
  ],
};
