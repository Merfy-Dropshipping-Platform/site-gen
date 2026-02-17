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
  siteTitle = "Rose Theme",
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
    <div className="w-full sticky top-0 z-50 bg-white shadow-sm">
      <header className="bg-white w-full h-16 sm:h-20 md:h-24 lg:h-28 xl:h-[120px] flex items-center border-b border-gray-100">
        <nav className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8 lg:px-16 xl:px-24 2xl:px-[300px] flex items-center justify-between">
          {/* Mobile: Hamburger Menu */}
          <button
            aria-label="Menu"
            className="md:hidden w-10 h-10 flex items-center justify-center hover:opacity-70 transition-opacity"
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
                stroke="black"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M11 23H29"
                stroke="black"
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
                <span className="text-lg sm:text-xl md:text-2xl font-comfortaa font-normal">
                  {siteTitle}
                </span>
              )}
            </a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4 lg:gap-8 xl:gap-12 2xl:gap-[80px]">
            {navigationLinks?.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className={`text-sm lg:text-base xl:text-[20px] font-normal text-black hover:opacity-70 transition-opacity leading-[1.366] relative font-manrope ${
                  index === 0
                    ? "after:absolute after:bottom-[-10px] after:left-0 after:w-full after:h-px after:bg-black"
                    : ""
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-[25px]">
            {showSearch && (
              <button
                aria-label="Search"
                className="hidden md:flex w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 items-center justify-center hover:opacity-70 transition-opacity"
              >
                <img
                  src="/search.svg"
                  alt="Search"
                  className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-10 lg:h-10"
                />
              </button>
            )}
            {showCart && (
              <button
                aria-label="Cart"
                className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center hover:opacity-70 transition-opacity"
              >
                <img
                  src="/cart.svg"
                  alt="Cart"
                  className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-10 lg:h-10"
                />
              </button>
            )}
            {showProfile && (
              <button
                aria-label="Profile"
                className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center hover:opacity-70 transition-opacity"
              >
                <img
                  src="/profile.svg"
                  alt="Profile"
                  className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-10 lg:h-10"
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
