import React from "react";

interface NavigationLink {
  label: string;
  href: string;
  submenu?: { label: string; href: string }[];
}

interface HeaderProps {
  siteTitle?: string;
  logo?: string;
  navigationLinks?: NavigationLink[];
  actionButtons?: {
    showSearch?: string;
    showCart?: string;
    showProfile?: string;
  };
}

export function Header({
  siteTitle = "Мой магазин",
  logo = "/logo.svg",
  navigationLinks = [
    { label: "Glavnaya", href: "/", submenu: [] },
    {
      label: "Katalog",
      href: "#popular",
      submenu: [
        { label: "Populyarnye", href: "#popular" },
        { label: "Kollekcii", href: "#collections" },
        { label: "Galereya", href: "#gallery" },
      ],
    },
    { label: "Kontakty", href: "#", submenu: [] },
  ],
  actionButtons = { showSearch: "true", showCart: "true", showProfile: "true" },
}: HeaderProps) {
  const showSearch = actionButtons?.showSearch === "true";
  const showCart = actionButtons?.showCart === "true";
  const showProfile = actionButtons?.showProfile === "true";

  return (
    <div className="w-full sticky top-0 z-50 bg-theme-background shadow-sm">
      <header className="bg-theme-background w-full h-16 md:h-[80px] flex items-center border-b border-theme">
        <nav className="w-full max-w-[1320px] mx-auto px-4 md:px-6 flex items-center justify-between">
          {/* Mobile: Hamburger Menu */}
          <button
            aria-label="Menu"
            className="md:hidden w-10 h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-theme-foreground"
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 17H29"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M11 23H29"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Logo */}
          <div className="absolute left-1/2 -translate-x-1/2 md:relative md:left-auto md:transform-none">
            <a
              href="/"
              className="flex items-center hover:opacity-80 transition-opacity"
            >
              {logo ? (
                <img
                  src={logo}
                  alt={siteTitle}
                  className="h-5 sm:h-6 md:h-[26px] w-auto"
                />
              ) : (
                <span className="text-lg sm:text-xl md:text-2xl font-heading font-normal">
                  {siteTitle}
                </span>
              )}
            </a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-[40px]">
            {navigationLinks?.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className="text-[16px] font-normal text-theme-foreground hover:opacity-70 transition-opacity leading-[1.4] font-body"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-[24px]">
            {showSearch && (
              <button
                aria-label="Search"
                className="hidden md:flex w-8 h-8 items-center justify-center hover:opacity-70 transition-opacity"
              >
                <img
                  src="/search.svg"
                  alt="Search"
                  className="w-8 h-8"
                />
              </button>
            )}
            {showCart && (
              <button
                aria-label="Cart"
                className="w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity"
              >
                <img
                  src="/cart.svg"
                  alt="Cart"
                  className="w-8 h-8"
                />
              </button>
            )}
            {showProfile && (
              <button
                aria-label="Profile"
                className="w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity"
              >
                <img
                  src="/profile.svg"
                  alt="Profile"
                  className="w-8 h-8"
                />
              </button>
            )}
          </div>
        </nav>
      </header>
    </div>
  );
}

export default Header;
