const heroImage = import.meta.env.BASE_URL + 'briefing-hero.jpg';

export default function BriefingAgentCover() {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-y-0 right-0 w-[51vw]">
        <img src={heroImage} crossOrigin="anonymous" alt="A source-linked meeting brief arranged beside a laptop" className="h-full w-full object-cover" />
        <div className="absolute inset-y-0 left-0 w-[22vw] bg-gradient-to-r from-bg via-bg/75 to-transparent" />
        <div className="absolute inset-0 bg-primary/10 mix-blend-multiply" />
      </div>
      <div className="absolute left-[5.5vw] top-[11vh] h-[78vh] w-[0.7vw] bg-primary" />
      <section className="relative z-10 flex h-full w-[61vw] flex-col justify-center pl-[8vw] pr-[3vw]">
        <h1 className="font-display text-[6.5vw] font-bold leading-[0.98] tracking-[-0.055em] text-text">Briefing Agent</h1>
        <p className="mt-[4vh] max-w-[43vw] font-body text-[2.35vw] font-medium leading-[1.28] text-text">Source-linked meeting preparation for a company or person.</p>
        <p className="mt-[2vh] max-w-[39vw] font-body text-[2vw] leading-[1.4] text-muted">A focused review of the past 30 days, organized into a concise brief.</p>
        <p className="mt-[8vh] font-display text-[1.8vw] font-semibold text-primary">Author: Sham Mohite</p>
      </section>
    </div>
  );
}
