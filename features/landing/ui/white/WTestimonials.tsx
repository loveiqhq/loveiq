import type { FC } from "react";
import TrustpilotReviews from "@shared/ui/trustpilot/TrustpilotReviews";

/**
 * "Field reports" social-proof section. Uses the live Trustpilot widget (light
 * theme) for real, verifiable reviews — the same source the dark landing uses.
 * The Figma comp mocked hand-curated quote cards, but the product deliberately
 * shows real Trustpilot reviews rather than curated quotes, so we keep that here
 * for a trustworthy, consistent A/B.
 */
const WTestimonials: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="content-shell flex flex-col items-center">
        <div className="animate-on-scroll mb-10 flex flex-col items-center gap-5 text-center">
          <TrustpilotReviews variant="compact" theme="light" showProfileLink={false} />
          <h2 className="max-w-2xl font-serif text-3xl font-semibold leading-tight text-[#161021] md:text-4xl">
            Field reports from people who took the first step.
          </h2>
        </div>
        <div className="w-full">
          <TrustpilotReviews variant="carousel" theme="light" />
        </div>
      </div>
    </section>
  );
};

export default WTestimonials;
