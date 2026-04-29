import { render, screen, fireEvent } from '@testing-library/react';
import { CartBodyIsland } from '../../cart/CartBodyIsland';
import { MockStoreProvider } from '../../testing/MockStoreProvider';
import { $cartItems } from '../../stores/cart';

const renderWithProvider = (ui: React.ReactElement) =>
  render(<MockStoreProvider>{ui}</MockStoreProvider>);

describe('CartBodyIsland', () => {
  it('renders heading and empty state when cart has no items', () => {
    renderWithProvider(<CartBodyIsland padding={{ top: 80, bottom: 40 }} />);
    expect(screen.getByText('КОРЗИНА')).toBeInTheDocument();
    expect(screen.getByText('Вы пока не добавили товар в корзину.')).toBeInTheDocument();
    expect(screen.getByText('Продолжить покупки')).toBeInTheDocument();
  });

  it('shows auth link when guest (default)', () => {
    renderWithProvider(<CartBodyIsland padding={{ top: 80, bottom: 40 }} />);
    expect(screen.getByText(/Есть аккаунт\?/)).toBeInTheDocument();
    expect(screen.getByText('Войти')).toBeInTheDocument();
  });

  it('hides auth link when isGuest=false', () => {
    renderWithProvider(
      <CartBodyIsland padding={{ top: 80, bottom: 40 }} isGuest={false} />,
    );
    expect(screen.queryByText(/Есть аккаунт\?/)).not.toBeInTheDocument();
  });

  it('renders item rows when cart has items', () => {
    $cartItems.set([
      {
        variantId: 'v1',
        title: 'Сумка',
        price: 599000,
        quantity: 1,
        image: 'https://example.com/bag.jpg',
      },
      {
        variantId: 'v2',
        title: 'Кошелёк',
        price: 299000,
        quantity: 2,
        image: 'https://example.com/wallet.jpg',
      },
    ]);

    renderWithProvider(<CartBodyIsland padding={{ top: 80, bottom: 40 }} />);
    expect(screen.getByText('Сумка')).toBeInTheDocument();
    expect(screen.getByText('Кошелёк')).toBeInTheDocument();
  });

  it('removes item when remove clicked', () => {
    $cartItems.set([
      {
        variantId: 'v1',
        title: 'Сумка',
        price: 599000,
        quantity: 1,
        image: 'https://example.com/bag.jpg',
      },
    ]);

    renderWithProvider(<CartBodyIsland padding={{ top: 80, bottom: 40 }} />);
    fireEvent.click(screen.getByLabelText('Удалить'));
    expect($cartItems.get()).toEqual([]);
  });

  it('increments quantity when + clicked', () => {
    $cartItems.set([
      {
        variantId: 'v1',
        title: 'Сумка',
        price: 599000,
        quantity: 1,
        image: 'https://example.com/bag.jpg',
      },
    ]);

    renderWithProvider(<CartBodyIsland padding={{ top: 80, bottom: 40 }} />);
    const plusButtons = screen.getAllByRole('button');
    const incButton = plusButtons.find((b) =>
      b.querySelector('path[d*="M16 8V24"]'),
    );
    expect(incButton).toBeDefined();
    fireEvent.click(incButton!);
    expect($cartItems.get()[0].quantity).toBe(2);
  });
});
