export default function BriefReadyToUse() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg text-text">
      <section className="absolute left-[6vw] top-[8vh] w-[52vw]">
        <h1 className="font-display text-[4.15vw] font-bold leading-[1.04] tracking-[-0.045em] text-text">A brief ready to use</h1>
        <ul className="mt-[5vh] space-y-[3.2vh] font-body text-[2vw] leading-[1.28] text-text">
          <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-primary" /><span>One-page print: up to 400 words, with sources listed separately</span></li>
          <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-accent" /><span>Copy the brief or use device read-aloud</span></li>
          <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-primary" /><span>Each crawl is limited to two minutes, with a three-minute backup stop</span></li>
          <li className="flex items-start gap-[1.2vw]"><span className="mt-[0.75vh] h-[1.1vh] w-[0.55vw] shrink-0 bg-accent" /><span>One event includes the crawl and resulting brief; up to 10 events per day</span></li>
        </ul>
      </section>
      <aside className="absolute inset-y-0 right-0 w-[34vw] overflow-hidden bg-primary">
        <div className="absolute left-[6vw] top-[15vh] h-[68vh] w-[22vw] rotate-[3deg] bg-bg shadow-[0_2vw_5vw_rgba(32,36,58,0.18)]">
          <div className="absolute left-[3vw] top-[8vh] h-[0.75vh] w-[14vw] bg-primary/70" />
          <div className="absolute left-[3vw] top-[13vh] h-[0.6vh] w-[16vw] bg-text/15" />
          <div className="absolute left-[3vw] top-[17vh] h-[0.6vh] w-[13vw] bg-text/15" />
          <div className="absolute left-[3vw] top-[24vh] h-[10vh] w-[16vw] border-l-[0.4vw] border-accent bg-accent/10" />
          <div className="absolute left-[3vw] top-[39vh] h-[0.6vh] w-[15vw] bg-text/15" />
          <div className="absolute left-[3vw] top-[43vh] h-[0.6vh] w-[12vw] bg-text/15" />
          <div className="absolute left-[3vw] top-[51vh] h-[0.8vh] w-[14vw] bg-accent/70" />
        </div>
        <div className="absolute -right-[9vw] -top-[8vh] h-[27vw] w-[27vw] rounded-full border border-bg/25" />
      </aside>
    </div>
  );
}
