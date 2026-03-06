import LandingPage from "@/components/landing/LandingPage";

export default function Page() {
  return (
    <>
      <link
        rel="preload"
        as="video"
        href="/couple-hero-mobile.mp4"
        type="video/mp4"
        media="(max-width: 640px)"
      />
      <link
        rel="preload"
        as="video"
        href="/couple-hero.mp4"
        type="video/mp4"
        media="(min-width: 641px)"
      />
      <LandingPage />
    </>
  );
}
