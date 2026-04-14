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
    placeholder: "email@example.com",
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
    email: "email@example.com",
    socialLinks: [
      { platform: "Facebook", href: "#" },
      { platform: "Instagram", href: "#" },
      { platform: "Twitter", href: "#" },
    ],
  },
  copyright = {
    companyName: "Мой магазин",
    showYear: "true",
    poweredBy: "Powered by Merfy",
  },
}: FooterProps) {
  const showNewsletter = newsletter?.enabled === "true";
  const currentYear = new Date().getFullYear();
  const yearStr = copyright?.showYear === "true" ? ` ${currentYear}` : "";

  return (
    <footer className="bg-theme-background w-full">
      <div className="w-full max-w-[1320px] mx-auto px-4 md:px-6">
        {/* Newsletter */}
        {showNewsletter && (
          <section className="pt-12 sm:pt-16 md:pt-20 lg:pt-24 xl:pt-28 2xl:pt-[100px] pb-10 sm:pb-12 md:pb-16 lg:pb-20 xl:pb-24">
            <div className="max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-[809px] mx-auto">
              <div className="flex flex-col items-center gap-3 sm:gap-4 lg:gap-[5px] mb-8 sm:mb-10 lg:mb-12">
                <h2 className="text-[20px] font-normal text-center" style={{ fontFamily: "'Bitter', serif", color: 'rgb(var(--color-foreground))', fontWeight: 400 }}>
                  {newsletter?.heading}
                </h2>
                {newsletter?.description && (
                  <p className="text-[16px] text-center px-4 sm:px-0" style={{ fontFamily: "'Arsenal', sans-serif", color: 'rgb(var(--color-foreground) / 0.8)' }}>
                    {newsletter.description}
                  </p>
                )}
              </div>
              <form className="w-full max-w-[652px] mx-auto h-[56px] flex flex-row items-center" style={{ border: '1px solid rgb(var(--color-foreground))', borderRadius: 0 }}>
                <input
                  type="email"
                  name="email"
                  placeholder={newsletter?.placeholder || "email@example.com"}
                  required
                  className="flex-1 bg-transparent text-[14px] outline-none h-full px-4"
                  style={{ fontFamily: "'Arsenal', sans-serif", color: 'rgb(var(--color-foreground))' }}
                />
                <button
                  type="submit"
                  className="h-[32px] px-4 mx-3 text-[14px] font-normal transition-opacity hover:opacity-80 whitespace-nowrap"
                  style={{ background: 'rgb(var(--color-foreground))', color: 'rgb(var(--color-background))', border: 'none', borderRadius: 0, fontFamily: "'Arsenal', sans-serif" }}
                >
                  {newsletter?.buttonText || '→'}
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
                <h3 className="text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-theme-foreground uppercase leading-[1.115] font-heading">
                  {navigationColumn.title}
                </h3>
                <nav className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                  {navigationColumn.links?.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-[14px] font-normal text-theme-muted leading-[1.366] hover:text-theme-foreground transition-colors" style={{ fontFamily: "'Arsenal', sans-serif" } as React.CSSProperties}
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
                <h3 className="text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-theme-foreground uppercase leading-[1.115] font-heading">
                  {informationColumn.title}
                </h3>
                <div className="flex flex-col gap-4 sm:gap-5 lg:gap-[25px]">
                  {informationColumn.links?.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-[14px] font-normal text-theme-muted leading-[1.366] hover:text-theme-foreground transition-colors" style={{ fontFamily: "'Arsenal', sans-serif" } as React.CSSProperties}
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
                  <h3 className="text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-theme-foreground uppercase leading-[1.115] font-heading">
                    {socialColumn.title}
                  </h3>
                  {socialColumn.email && (
                    <a
                      href={`mailto:${socialColumn.email}`}
                      className="text-[14px] font-normal text-theme-muted leading-[1.366] hover:text-theme-foreground transition-colors" style={{ fontFamily: "'Arsenal', sans-serif" } as React.CSSProperties}
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
                                stroke="currentColor"
                                opacity="0.4"
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
      <div className="w-full h-[64px] bg-black flex items-center justify-center">
        <p className="text-[16px] font-light text-white text-center px-4" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>
          &copy;{yearStr} {copyright?.companyName} All rights reserved.{" "}
          {copyright?.poweredBy}
        </p>
      </div>
    </footer>
  );
}

export default Footer;
