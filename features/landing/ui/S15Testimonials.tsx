import type { FC } from "react";
import TrustpilotReviews from "@shared/ui/trustpilot/TrustpilotReviews";

/**
 * Social-proof section. The former hand-curated testimonial grid, the "4.9/5
 * Rating" badge, and the "30,000+ people…" stat have been replaced by Trustpilot:
 * a compact TrustScore block in the header and a live review carousel below.
 * Both fall back to a cookieless static Trustpilot block before consent.
 */
const S15Testimonials: FC = () => {
  return (
    <section className="section-shell relative bg-[#0A0510] px-4">
      <div className="content-shell relative flex flex-col items-center">
        {/* Header — Trustpilot rating (replaces the old 4.9/5 badge + 30,000+ stat) */}
        <div className="animate-on-scroll mb-12 flex flex-col items-center gap-6 text-center">
          <TrustpilotReviews variant="compact" showProfileLink={false} />
          <h2 className="max-w-3xl font-serif text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl md:leading-[1.2]">
            Loved by people taking the first step
            <br />
            to understand themselves.
          </h2>
        </div>

        {/* Trustpilot review carousel (replaces the old 2×2 testimonial grid) */}
        <div className="w-full">
          <TrustpilotReviews variant="carousel" />
        </div>
      </div>
    </section>
  );
};

export default S15Testimonials;
