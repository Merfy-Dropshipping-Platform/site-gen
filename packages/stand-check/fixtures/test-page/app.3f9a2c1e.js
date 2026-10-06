// Тестовая страница инструмента стенда: всё, что должен увидеть паспорт.
window.__MERFY_SAMPLE__ = { b: 2, a: 1 };
localStorage.setItem('merfy:cartId', 'cart-1');
sessionStorage.setItem('stand:visit', '1');
document.cookie = 'merfy_consent=yes; path=/';
console.error('стенд: тестовая ошибка');
await fetch('/api/stand/ping');
await fetch('/api/stand/unknown');
