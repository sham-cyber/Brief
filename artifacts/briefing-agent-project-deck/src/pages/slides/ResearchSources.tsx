export default function ResearchSources() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg text-text">
      <section className="absolute left-[6vw] top-[8vh] w-[82vw]">
        <h1 className="max-w-[78vw] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.045em] text-text">Research that leads back to sources</h1>
      </section>
      <ul className="absolute left-[6vw] top-[25vh] w-[55vw] space-y-[3vh] font-body text-[2vw] leading-[1.28] text-text">
        <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-primary" /><span>Tavily searches the selected public topics</span></li>
        <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-accent" /><span>Up to five topic searches can belong to one briefing event</span></li>
        <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-primary" /><span>Results are checked for subject fit, recency, and source links</span></li>
        <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-accent" /><span>Relevant photos or videos appear when returned</span></li>
        <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-primary" /><span>AI is currently off; no AI-generated claims are added</span></li>
      </ul>
      <div className="absolute right-[6vw] top-[25vh] h-[60vh] w-[30vw] overflow-hidden bg-[#d9e8e3]">
        <div className="absolute left-[5vw] top-[7vh] h-[45vh] w-[19vw] rotate-[5deg] bg-bg shadow-[0_2vw_4vw_rgba(32,36,58,0.12)]" />
        <div className="absolute left-[7.5vw] top-[12vh] h-[0.7vh] w-[12vw] bg-primary/70" />
        <div className="absolute left-[7.5vw] top-[16vh] h-[0.6vh] w-[15vw] bg-text/15" />
        <div className="absolute left-[7.5vw] top-[20vh] h-[0.6vh] w-[13vw] bg-text/15" />
        <div className="absolute left-[7.5vw] top-[25vh] h-[7vh] w-[15vw] border-l-[0.35vw] border-accent bg-accent/10" />
        <div className="absolute left-[7.5vw] top-[35vh] h-[0.6vh] w-[14vw] bg-text/15" />
        <div className="absolute left-[7.5vw] top-[39vh] h-[0.6vh] w-[11vw] bg-text/15" />
        <div className="absolute left-[7.5vw] top-[45vh] h-[0.6vh] w-[14vw] bg-primary/50" />
        <div className="absolute right-[4vw] bottom-[7vh] h-[8vw] w-[8vw] rounded-full border-[0.35vw] border-primary bg-bg" />
        <div className="absolute right-[7.5vw] bottom-[10.4vh] h-[1.5vh] w-[1.5vh] rounded-full bg-accent" />
      </div>
    </div>
  );
}
