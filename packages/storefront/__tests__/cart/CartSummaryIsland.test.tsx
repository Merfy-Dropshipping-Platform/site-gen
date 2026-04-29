import { render, screen } from '@testing-library/react';
import { CartSummaryIsland } from '../../cart/CartSummaryIsland';
import { MockStoreProvider } from '../../testing/MockStoreProvider';
import { $cartItems } from '../../stores/cart';

const renderWithProvider = (ui: React.ReactElement) =>
  render(<MockStoreProvider>{ui}</MockStoreProvider>);

describe('CartSummaryIsland', () => {
  it('renders nothing when cart is empty', () => {
    const { container } = renderWithProvider(
      <CartSummaryIsland padding={{ top: 0, bottom: 80 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders disclaimer + total + checkout button when cart has items', () => {
    $cartItems.set([
      {
        variantId: 'v1',
        title: 'Сумка',
        price: 599000,
        quantity: 1,
        image: 'https://example.com/bag.jpg',
      },
    ]);

    renderWithProvider(<CartSummaryIsland padding={{ top: 0, bottom: 80 }} />);
    expect(screen.getByText(/Налоги, скидки/)).toBeInTheDocument();
    expect(screen.getByText('Итого')).toBeInTheDocument();
    const checkout = screen.getByText('Оформить заказ');
    expect(checkout.closest('a')?.getAttribute('href')).toBe('/checkout');
  });

  it('formats total as RUB currency', () => {
    $cartItems.set([
      {
        variantId: 'v1',
        title: 'Сумка',
        price: 599000,
        quantity: 1,
        image: '',
      },
      {
        variantId: 'v2',
        title: 'Кошелёк',
        price: 100000,
        quantity: 2,
        image: '',
      },
    ]);

    renderWithProvider(<CartSummaryIsland padding={{ top: 0, bottom: 80 }} />);
    // 5990 + 1000*2 = 7990 ₽ (locale may use NBSP or NNBSP between digits)
    expect(screen.getByText(/7\s990/)).toBeInTheDocument();
  });
});
