import { extractPageBlocks } from '../page-blocks';

describe('Publications page block normalization', () => {
  it('returns the same synchronized effective counts for shared preview/live consumers', async () => {
    const data = {
      pagesData: {
        home: {
          content: [{
            type: 'Publications',
            props: {
              heading: 'Publications',
              cards: 3,
              cardsCount: 5,
              columns: 3,
              columnsCount: 4,
            },
          }],
        },
      },
    };

    const blocks = await extractPageBlocks(data, 'home', null, null, 'site-1');

    expect(blocks?.[0].props).toMatchObject({
      cards: 4,
      cardsCount: 4,
      columns: 4,
      columnsCount: 4,
      siteId: 'site-1',
    });
  });
});
