export default function ChooseTopics() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg text-text">
      <div className="absolute left-0 top-0 h-[1.2vh] w-[34vw] bg-primary" />
      <section className="absolute left-[6vw] top-[9vh] w-[82vw]">
        <h1 className="font-display text-[4vw] font-bold leading-[1.05] tracking-[-0.045em] text-text">Choose the topics that matter</h1>
        <div className="mt-[10vh] grid grid-cols-5 gap-[1.1vw]">
          <div className="flex h-[29vh] items-end bg-primary px-[1.4vw] pb-[3vh] text-bg"><span className="font-display text-[2.45vw] font-semibold leading-[1.05]">News</span></div>
          <div className="flex h-[29vh] items-end bg-accent px-[1.4vw] pb-[3vh] text-bg"><span className="font-display text-[2.45vw] font-semibold leading-[1.05]">Hires</span></div>
          <div className="flex h-[29vh] items-end bg-[#e5ded0] px-[1.4vw] pb-[3vh] text-text"><span className="font-display text-[2.35vw] font-semibold leading-[1.05]">Launches</span></div>
          <div className="flex h-[29vh] items-end bg-[#e9e4f1] px-[1.4vw] pb-[3vh] text-text"><span className="font-display text-[2.2vw] font-semibold leading-[1.05]">Financial Facts</span></div>
          <div className="flex h-[29vh] items-end bg-[#d9e8e3] px-[1.4vw] pb-[3vh] text-text"><span className="font-display text-[2.05vw] font-semibold leading-[1.05]">Risks &amp; Open Questions</span></div>
        </div>
        <p className="mt-[6vh] max-w-[72vw] font-body text-[2.15vw] leading-[1.3] text-muted">Select one topic or combine several for the same briefing.</p>
      </section>
      <div className="absolute bottom-[7vh] right-[6vw] h-[0.55vh] w-[18vw] bg-accent" />
    </div>
  );
}
