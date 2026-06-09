# SuperAI NEXT Hackathon 2026 Brief

Updated on 9 June 2026 from the official SuperAI page, DoraHacks submission-guidelines page context, and `superai-official-details.md`, with prior public-source context retained where still useful.

## Executive Snapshot

- **Event:** SuperAI NEXT Hackathon 2026, SuperAI's flagship hackathon.
- **Dates:** **9-11 June 2026**. Hacking begins at **12:00 pm on 9 June**. Submissions are due by **11:59 pm on 10 June**. Top 5 finalists are announced at **12:00 pm on 11 June** and demo at **5:30 pm on 11 June**.
- **Venue:** SuperAI, Marina Bay Sands, Singapore. Finalist demos happen on the **WEKA Stage**.
- **Format:** 36-hour in-person sprint for **200 builders**.
- **Team size:** **1-4 members**. Solo entries are allowed, but SuperAI strongly recommends forming a team.
- **Prize pool:** **Over US$200K** in prizes, credits, and resources. Awards stack, so one project can win multiple categories.
- **Finals:** The **Top 5** teams demo live on the WEKA Stage in front of SuperAI's 10,000-person conference audience.
- **Core requirement:** Build anything, but make it agentic. Agents need to do real work at the core of the product.
- **Fairness rule:** Project implementation must start only after the official hacking period begins. Brainstorming before kickoff is allowed; code, designs, and prototypes are not.

## Official Theme

**Build anything, but make it agentic.**

The official framing is domain-open: productivity, finance, healthcare, creative tools, infrastructure, and other categories are all valid. The differentiator is not the problem category; it is whether the project meaningfully pushes autonomous systems forward.

In practical terms, a strong project should show:

- An agent with a clear purpose, not just a chatbot interface.
- Autonomous decision-making: planning, reasoning, tool selection, or next-step choice.
- Real actions through APIs, tools, environments, or workflows.
- Observable recovery from errors or unexpected states.
- A demo that makes the agent's work visible quickly.

## Official Stack and Credits

The official stack is designed around the layers a production-ready agent needs: backend infrastructure, frontend deployment, live information access, and real-world actions.

- **AWS:** Backend cloud infrastructure for compute, storage, databases, and managed AI services. Every team gets a temporary AWS account with full service access plus **500 Kiro credits**.
- **Vercel:** Frontend deployment and AI tooling. Teams can deploy the UI, use v0 for interface generation, and route model calls through Vercel AI Gateway. Each team gets **US$50 in v0 credits**.
- **Exa:** Web search and retrieval for agents, returning clean structured content from the live web. Each team gets **US$100 in Exa credits**.
- **Stripe:** Payments and financial workflows for charging users, subscriptions, or payouts. Each team gets **US$250 in Stripe credits**.
- **Dify:** Each team gets a **1-month Dify Pro subscription**.
- **Razer:** Hardware support in the room, with keyboard, mouse, mousemat, and headset on every table.

Strategic implication: the safest architecture story is an agentic product deployed on AWS and Vercel, using Exa when live intelligence matters and Stripe when payments or financial actions make the demo stronger.

## Awards and Prize Paths

You submit one project, but the official awards are stackable.

### Top 5 Overall Projects

The five strongest projects demo on the WEKA Stage. Finalists are expected to ship a real working product, specifically a deployed app running on **AWS and Vercel**.

Each finalist team receives:

- **AWS:** US$25,000 in AWS credits, terms apply.
- **Vercel:** US$1,500 in v0 credits.
- **Razer:** A gift bag per team member, valued at about US$500, including ProClick v2 Mouse, Pro Glide XXL Mousemat, and Pro Type Ergo keyboard.

### Best Use of Exa

Awarded by the Exa team to the teams that most effectively use Exa for agent intelligence, search, or real-time data access. You do not need to be a Top 5 finalist to win.

- **Top 3 teams:** US$1,500 in Exa credits each.

### Best Use of Stripe

Awarded by the Stripe team to the top three teams that demonstrate depth of Stripe integration, innovative monetization strategies with high growth potential, and a polished demo. You do not need to be a Top 5 finalist to win.

- **Top 3 teams:** US$1,000 in Stripe credits each.

## Judging Criteria

The official details say submissions are evaluated across four dimensions and list the following evaluation prompts:

- **Agent Overview:** What agent or agents did you build, and what is their purpose?
- **Autonomy and Decision-Making:** How does the agent decide what to do next? What reasoning, planning, or tool-use patterns does it use?
- **Actions and Tool Use:** What actions can the agent take? What tools, APIs, or environments does it interact with?
- **Orchestration:** If multi-agent, how do agents coordinate, delegate, or communicate?
- **Human-in-the-Loop:** Where does a human intervene, approve, or override?
- **Failure Handling:** How does the agent recover from errors or unexpected states?
- **Demo and Presentation:** How clear is the pitch, how good is the demo/product, and how well does the team communicate what it built?

What this means for build strategy:

1. **Show the agent's loop.** Judges need to see perception, reasoning, action, and feedback, not only final output.
2. **Make tool use inspectable.** Surface which tools were called, why, and what happened.
3. **Design for failure.** Include at least one visible recovery path: retries, fallbacks, human approval, rollback, or escalation.
4. **Keep the pitch concrete.** A polished, understandable demo is explicitly part of the rubric.

## Official Schedule

### Day 1 - 9 June 2026

- **9:00 am:** Registration and breakfast.
- **10:00 am:** Hackathon kickoff briefing. The official details call this essential and say not to miss it.
- **10:15 am:** AWS workshop.
- **10:45 am:** Vercel workshop.
- **11:15 am:** Stripe workshop.
- **11:35 am:** Exa workshop.
- **12:00 pm:** Hacking begins.
- **1:00 pm:** Lunch.
- **7:00 pm:** Dinner.
- **12:00 am:** Midnight snack.

### Day 2 - 10 June 2026

- **All day:** Hacking continues and SuperAI Day 1 begins.
- **7:00 pm:** Dinner.
- **11:59 pm:** Project submissions due and supper.
- **7:30 am-6:00 pm:** Breakfast, lunch, and coffee are available during conference hours at SuperAI on Level 5.

### Day 3 - 11 June 2026

- **12:00 pm:** Top 5 finalists announced and open mic.
- **5:30 pm:** Top 5 finalist demos, prize announcements, and group photo on the WEKA Stage.

## Submission Requirements

Deadline: **12:00 am on 11 June**, meaning teams must submit by **11:59 pm on 10 June 2026**. No late entries are allowed. The DoraHacks submission-guidelines page confirms the same deadline and required submission package.

Every team must submit:

- **GitHub repo:** Public, or with judge access granted.
- **Project link:** Live URL or hosted demo.
- **Presentation slides:** Google Drive link to a `.ppt` or `.keynote` file.

Slide constraints matter because they are used if the team is selected as a Top 5 finalist:

- Slides must be `.ppt` or `.keynote`.
- Google Slides, Gamma, and Vercel page links are not accepted.
- If showing the demo in action, use an embedded screen recording.
- Live demos are prohibited on stage to avoid technical errors.
- Do not link to YouTube or external video.
- Slides are locked at submission and cannot be changed after the deadline.
- Keep slides visual and punchy; they are a support aid for the live pitch.

## Practical Logistics

- **Do not miss the 10:00 am kickoff briefing on 9 June.** The official details mark it as essential.
- **Do not build before kickoff.** SuperAI's FAQ says fairness requires all project work to begin after the official hacking period starts; brainstorming is fine, but code, designs, and prototypes before kickoff are not.
- **Collect and test credits immediately.** AWS, Vercel, Exa, Stripe, and Dify access should be validated before core implementation depends on them.
- **Use the workshops for sponsor-specific judging intel.** AWS, Vercel, Stripe, and Exa each have official workshop slots before hacking starts.
- **Plan the stage package before the deadline.** The `.ppt` or `.keynote` file, embedded screen recordings, and final pitch visuals must be ready by submission because slides are locked.
- **Exploit the room setup.** Meals, supper, snacks, drinks, coffee, bean bags, rest areas, and full SuperAI conference access are included.
- **Plan your own travel and recovery.** The event is free and includes food, drinks, and conference access, but SuperAI does not cover flights, visas, or accommodation. Rest areas are first-come, first-served and the venue has no shower facilities.

## Strategic Readout

### Good Bets

- Agents that combine **live information retrieval** with concrete downstream actions.
- Products where AWS and Vercel make the deployment story credible and easy for judges to access.
- Exa-heavy workflows where fresh web intelligence is core to the agent's reasoning.
- Stripe-enabled workflows where monetization, payments, subscriptions, payouts, or financial operations are central to the use case.
- Multi-agent systems only when orchestration is visible and genuinely useful.

### Risky Bets

- General-purpose chat wrappers with weak autonomy.
- Projects where the agent cannot take real actions.
- Apps that hide reasoning and tool use so judges cannot inspect agentic behavior.
- Finalist pitches that rely on a live demo instead of an embedded screen recording.
- Decks submitted as Google Slides, Gamma, web pages, or video links instead of `.ppt` or `.keynote`.

## Recommended Build Checklist

- Define the agent's job, tools, decision policy, and failure modes before writing code.
- Keep pre-kickoff work to ideation and planning only; do not create code, designs, or prototypes before the official hacking window.
- Decide which award paths you are targeting: Top 5, Exa, Stripe, or a stackable combination.
- Build the deployed URL early on AWS and Vercel, then iterate behind it.
- Add a visible trace, activity log, or replay so judges can see autonomy and tool use.
- Prepare a 60-90 second screen recording for the finalist deck.
- Freeze a stage-ready `.ppt` or `.keynote` before the submission deadline.
- Keep a fallback path ready if any sponsor credit, API key, or deployment flow is delayed.

## Signals From 2025

The official 2025 event report said the inaugural NEXT Hackathon selected **60 participants**, ran for **36 hours**, and had a **US$50,000** prize pool. Projects spanned **robotics, finance, healthcare, retail, and sustainability**. Mentorship came from leaders at **AWS, Shellkode, and SambaNova Systems**.

One externally documented winner, **DripSeek**, was a browser extension that identified clothing on streaming platforms and connected it to instant shopping and virtual try-on. Another externally documented winner, **offhand.ai**, focused on medical-forensics workflow automation. Different domains, same pattern: clear user problem, obvious demo, believable real-world use.

## Source Materials

- `superai-official-details.md`
- https://dorahacks.io/hackathon/next-hackathon/detail#submission-guidelines
- https://www.competehub.dev/en/competitions/dorahacksnext-hackathon
- https://www.superai.com/next-hackathon
- https://www.superai.com/
- https://www.superai.com/agenda
- https://www.superai.com/partners
- https://www.superai.com/reports/2025-event-report
- https://www.sutd.edu.sg/achievements-listing/winners-in-superai-next-hackathon-2025-dripseek/
- https://www.seanheng.com/
- https://docs.exa.ai/
- https://docs.stripe.com/payments/checkout

## Notes

This version supersedes the earlier public-source brief where the 2026 theme, stack, prize structure, judging criteria, and submission rules were not yet available. The official details now confirm the hackathon is domain-open, agent-first, and explicitly oriented around AWS, Vercel, Exa, and Stripe.

The DoraHacks page currently serves human verification to command-line fetches, so the direct page could not be archived locally. Its submission-guidelines content was cross-checked against the indexed CompeteHub summary published on 8 June 2026 and the official SuperAI page.
