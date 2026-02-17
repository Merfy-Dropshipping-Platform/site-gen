import React from "react";

interface FooterLink {
  label: string;
  href: string;
}

interface SocialLink {
  platform: string;
  href: string;
}

interface FooterProps {
  newsletter?: {
    enabled?: string;
    heading?: string;
    description?: string;
    placeholder?: string;
  };
  navigationColumn?: {
    title?: string;
    links?: FooterLink[];
  };
  informationColumn?: {
    title?: string;
    links?: FooterLink[];
  };
  socialColumn?: {
    title?: string;
    email?: string;
    socialLinks?: SocialLink[];
  };
  copyright?: {
    companyName?: string;
    showYear?: string;
    poweredBy?: string;
  };
}

export function Footer({
  newsletter = {
    enabled: "true",
    heading: "Subscribe to our newsletter",
    description: "Enter your email to receive updates from our brand.",
    placeholder: "rose@example.ru",
  },
  navigationColumn = {
    title: "Navigation",
    links: [
      { label: "Home", href: "/" },
      { label: "Catalog", href: "#popular" },
      { label: "Contacts", href: "#" },
    ],
  },
  informationColumn = {
    title: "Information",
    links: [
      { label: "Shipping Policy", href: "#" },
      { label: "Return Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
    ],
  },
  socialColumn = {
    title: "Social Networks",
    email: "rose@example.ru",
    socialLinks: [
      { platform: "Facebook", href: "#" },
      { platform: "Instagram", href: "#" },
      { platform: "Twitter", href: "#" },
    ],
  },
  copyright = {
    companyName: "Rose Theme",
    showYear: "true",
    poweredBy: "Powered by Merfy",
  },
}: FooterProps) {
  const showNewsletter = newsletter?.enabled === "true";
  const currentYear = new Date().getFullYear();
  const yearStr = copyright?.showYear === "true" ? ` ${currentYear}` : "";

  return (
    <footer className="bg-white w-full">
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-[300px]">
        {/* Newsletter */}
        {showNewsletter && (
          <section className="pt-12 sm:pt-16 md:pt-20 lg:pt-24 xl:pt-28 2xl:pt-[100px] pb-10 sm:pb-12 md:pb-16 lg:pb-20 xl:pb-24">
            <div className="max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-[809px] mx-auto">
              <div className="flex flex-col items-center gap-3 sm:gap-4 lg:gap-[5px] mb-8 sm:mb-10 lg:mb-12">
                <h2 className="text-2xl sm:text-3xl md:text-[32px] lg:text-[34px] xl:text-[36px] font-normal text-black uppercase leading-[1.115] text-center font-comfortaa">
                  {newsletter?.heading}
                </h2>
                {newsletter?.description && (
                  <p className="text-base sm:text-lg md:text-xl lg:text-[22px] xl:text-[24px] font-normal text-[#999999] leading-[1.366] text-center px-4 sm:px-0 font-manrope">
                    {newsletter.description}
                  </p>
                )}
              </div>
              <form className="w-full max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-[600px] mx-auto h-auto sm:h-16 md:h-[70px] lg:h-[75px] xl:h-[80px] bg-white border border-[#999999] rounded-lg md:rounded-[10px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center px-4 sm:px-5 lg:px-[25px] py-3 sm:py-2 lg:py-[10px] gap-3 sm:gap-2 lg:gap-[10px]">
                <input
                  type="email"
                  name="email"
                  placeholder={newsletter?.placeholder || "rose@example.ru"}
                  required
                  className="flex-1 bg-transparent text-lg sm:text-xl md:text-[22px] lg:text-2xl font-light text-[#999999] leading-[1.366] outline-none placeholder:text-[#999999] focus:text-black font-manrope"
                />
                <button
                  type="submit"
                  aria-label="Subscribe"
                  className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center self-end sm:self-center hover:scale-110 transition-transform"
                >
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5 12H19M19 12L12 5M19 12L12 19"
                      stroke="black"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </form>
            </div>
          </section>
        )}

        {/* Footer Columns */}
        <section className="pb-6 sm:pb-8 md:pb-10 lg:pb-12 xl:pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 md:gap-12 lg:gap-16 xl:gap-20">
            {/* Navigation Column */}
            {navigationColumn?.title && (
              <div className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                <h3 className="text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-black uppercase leading-[1.115] font-comfortaa">
                  {navigationColumn.title}
                </h3>
                <nav className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                  {navigationColumn.links?.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-base sm:text-lg md:text-[18px] lg:text-[20px] font-normal text-[#999999] leading-[1.366] hover:text-black transition-colors font-manrope"
                    >
                      {link.label}
                    </a>
                  ))}
                </nav>
              </div>
            )}

            {/* Information Column */}
            {informationColumn?.title && (
              <div className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                <h3 className="text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-black uppercase leading-[1.115] font-comfortaa">
                  {informationColumn.title}
                </h3>
                <div className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                  {informationColumn.links?.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-base sm:text-lg md:text-[18px] lg:text-[20px] font-normal text-[#999999] leading-[1.366] hover:text-black transition-colors font-manrope"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Social Column */}
            {socialColumn?.title && (
              <div className="sm:col-span-2 lg:col-span-1">
                <div className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                  <h3 className="text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-black uppercase leading-[1.115] font-comfortaa">
                    {socialColumn.title}
                  </h3>
                  {socialColumn.email && (
                    <a
                      href={`mailto:${socialColumn.email}`}
                      className="text-base sm:text-lg md:text-[18px] lg:text-[20px] font-normal text-[#999999] leading-[1.366] hover:text-black transition-colors font-manrope"
                    >
                      {socialColumn.email}
                    </a>
                  )}
                  {socialColumn.socialLinks &&
                    socialColumn.socialLinks.length > 0 && (
                      <div className="flex gap-3 sm:gap-4 lg:gap-[15px]">
                        {socialColumn.socialLinks.map((social, index) => (
                          <a
                            key={index}
                            href={social.href}
                            aria-label={social.platform}
                            className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 flex items-center justify-center hover:opacity-70 transition-opacity"
                          >
                            <svg
                              className="w-full h-full"
                              viewBox="0 0 40 40"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle
                                cx="20"
                                cy="20"
                                r="19.5"
                                stroke="#999999"
                              />
                            </svg>
                          </a>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Copyright Bar */}
      <div className="w-full h-auto sm:h-20 md:h-24 lg:h-[100px] bg-black flex items-center justify-center py-6 sm:py-0">
        <p className="text-sm sm:text-base md:text-lg lg:text-[20px] font-light text-white leading-[1.21] text-center px-4 sm:px-6 font-inter">
          &copy;{yearStr} {copyright?.companyName} All rights reserved.{" "}
          {copyright?.poweredBy}
        </p>
      </div>
    </footer>
  );
}

export default Footer;
