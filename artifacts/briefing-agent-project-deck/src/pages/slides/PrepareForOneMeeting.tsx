export default function PrepareForOneMeeting() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg text-text">
      <section className="absolute left-[6vw] top-[9vh] w-[56vw]">
        <h1 className="font-display text-[4.1vw] font-bold leading-[1.04] tracking-[-0.045em] text-text">Prepare for one meeting</h1>
        <ul className="mt-[5vh] space-y-[3.2vh] font-body text-[2.1vw] leading-[1.25] text-text">
          <li className="flex items-start gap-[1.5vw]"><span className="mt-[0.8vh] h-[1.3vh] w-[0.55vw] shrink-0 bg-accent" /><span>Choose Company or Person</span></li>
          <li className="flex items-start gap-[1.5vw]"><span className="mt-[0.8vh] h-[1.3vh] w-[0.55vw] shrink-0 bg-primary" /><span>Set the meeting date and time</span></li>
          <li className="flex items-start gap-[1.5vw]"><span className="mt-[0.8vh] h-[1.3vh] w-[0.55vw] shrink-0 bg-accent" /><span>Add context to focus the research</span></li>
          <li className="flex items-start gap-[1.5vw]"><span className="mt-[0.8vh] h-[1.3vh] w-[0.55vw] shrink-0 bg-primary" /><span>Review public information from the past 30 days</span></li>
        </ul>
      </section>
      <aside className="absolute inset-y-0 right-0 flex w-[35vw] items-center justify-center overflow-hidden bg-primary text-bg">
        <div className="absolute -right-[5vw] top-[13vh] h-[42vw] w-[42vw] rounded-full border border-bg/20" />
        <div className="absolute -right-[1vw] top-[20vh] h-[32vw] w-[32vw] rounded-full border border-bg/25" />
        <div className="absolute right-[5.5vw] top-[28vh] h-[18vw] w-[18vw] rounded-full border-[0.14vw] border-bg/35" />
        <div className="relative z-10 font-display text-[19vw] font-bold leading-none tracking-[-0.08em]">30</div>
      </aside>
      <div className="absolute bottom-[7vh] left-[6vw] h-[0.45vh] w-[54vw] bg-accent/70" />
    </div>
  );
}
