# Steering log: how the work went between me and Claude

The point of this file is the process: what I asked for, what Claude built first, where I had to redirect it, where Claude was wrong, and who caught each mistake. "Me" is the project owner. "Claude" is the AI that wrote the code (Claude Code, one long session on 2026-10-29, plus an earlier chat that is in `01-conversation-log.md`).

Everything in quotes is my message, word for word, typos included. Where I quote a "turn" number, the first fourteen are in `01-conversation-log.md`.

## The build in five commits

| Commit | What it contained | Prompted by |
|---|---|---|
| `bb21b93` | Starting point: "margin", a mock-only assistant (earlier chat, turn 14) | Earlier chat |
| `2369938` | Four features, new cast (Jake, Alyssa, Brad, Sarah, Priya), Outlook-style sample calendars, time zones, chat booking | My four-feature brief, then four answered questions |
| `72da3bc` | Ollama connected, two apps instead of tabs, teammate roster, single knowledge base, demo script, 96 checks | My "separate apps / LLM / one knowledge base / copy-paste" message, then my mid-turn corrections |
| `6ff57c0` | Hidden developer controls, evening flight, six seeded double-bookings, an agent that fixes conflicts and briefs the week | My "holistic platform / interactive agent" message |
| `6622c72` | Renamed to Tessera | My naming exchange |

Between commits there were many smaller edits, runs against a real model, and fixes. Those are described below.

---

## Where I changed Claude's direction

### 1. "Ask me what questions you have" (process, not product)
My brief listed four features and the cast, and ended: *"Ask me what questions you have to help me build this."* Claude read the existing repo first and asked four questions instead of starting to code: evolve the existing app or rewrite; mock or live LLM; how much calendar data per person; how deep to go on time zones. My answers: evolve it, mock now but live-ready, three calendars for me and one each for everyone else, full time zone support. Those four answers shaped the whole data model.

### 2. Two apps: Claude built tabs, I wanted separate apps
**Claude's first version:** one page with tabs: *Fresh start*, *Finished product*, *Demo script*, *Summary*, both apps mounted at once.

**Me**, after seeing it: *"[Fresh start / Finished product / Demo script / Summary] are separate tabs. That shouldn't exist. It should just be the one tab. I want to be able to load two separate apps, one that is new and one that is completed."*

**Result:** separate pages from one codebase (`/` and `/fresh.html`), a standalone `/demo.html`, no tab bar (`06-decisions.md` D21). The finished app has to be exactly what the script produces, so it can't be a different program.

### 3. The knowledge base: Claude built profile cards, I wanted one thing you can prompt
**Claude's first version:** a panel on the home screen with a card per person, each with their own facts.

**Me:** *"I'm thinking to not have a separate knowledge base stored for each, but rather one that I can prompt an LLM for context of."* After a first fix still left a panel on the home screen: *"Remove the knowledge base module view on the home screen. It should be included in the assistant that I can prompt."*

**Result:** one list of my own sentences, shown as a drawer inside the chat, which the model reads when I ask (D24). It took two corrections, because Claude's first fix only changed the data model and left the panel.

### 4. Teammates: Claude pre-loaded them, I wanted to add them
**Claude's first version:** all five teammates and their calendars were already there.

**Me:** *"I should be able to add teammates. These shouldn't already be there. Then, separately, I can add calendars to the teammates."*

**Result:** a roster (add the person) and, separately, their calendar. Asking for a meeting with someone not yet added is refused with the exact sentence to fix it (D22).

### 5. "Teams are messy": I made the sample data worse on purpose
Claude's sample data had Priya's calendar correct (a late shift with a small overlap). Teaching Claude about Priya added nothing.

**Me:** *"a prompt like 'Priya is in Bengaluru and only works 8 am - 12 PM ET' is important context. The goal is to show teams are messy, and this helps you manage them."*

**Result:** Claude changed the data so Priya's calendar settings say 9 to 6 India time (which never overlaps my day) and the truth lives only in what I teach it. Without the sentence the assistant finds no times; with it, it finds some (D23). That became the centerpiece of the demo.

### 6. A real model
**Me:** *"I really want an LLM connected. ollama is good, I already have it installed on my machine."* Claude had only a mock. It built the provider, then ran the demo script against my local `llama3.2` and found the problems in `12-prompt-iterations.md`. I didn't specify any of the guardrails; they came from what broke.

### 7. Exact examples, from me
- The flight: *"The flight example should be from Monday at 5:00 PM from ORD to LGA, with an hour buffer each way automatically."* Claude's version was a Wednesday ORD to DEN flight with a before-only hold. Later: *"Add a return flight 8:00 PM to 10:00 PM on Thursday."*
- *"I want you to have an exact walkthrough of what I should do for the demo. I don't want to have to type everything."* → copy buttons, then, after my second message: *"it should be divided as I had the four features above. First is importing my calendars, second is adding my context, third is adding team members and their calendars, fourth is adding context into the knowledge base, fifth is showing how we can schedule meetings."* → a five-part script generated from one data file.

### 8. "Assume this is what someone would see"
*"Can you remove the ollama connected? Assume this application is what someone would see."* Claude had left developer controls (model picker, trace) on the product screen. They now only show with `?dev=1` (D28).

### 9. "Fully holistic", "interactive AI agent"
*"The initial calendars should have overlapping events and such. Also, the goal is this is an interactive AI agent that handles things for you. I'm open to additional suggestions."* Claude seeded six realistic double-bookings and built the agent behaviors: briefing, finding conflicts, proposing fixes, applying them on click (D29, D30), and listed more ideas (invite triage, prep briefs, focus protection, delegation to an EA, write-back to Outlook).

### 10. Naming
I proposed "Pascal", thinking of it as "Passive Calendar". Claude used it and wrote a different backronym (Personal Agent for Scheduling, Calendars And Logistics), arguing that "passive" contradicts an agent. Neither of us had checked whether the name was taken. Then: *"Can you help me think of a new name? There is already a Pascal AI  :("*. Claude gave a list; my own side-question, *"oh is there something I can do with with Tetris? Like piecing it together?"*, led to **Tessera** (a mosaic tile, a week assembled from pieces). Claude also noted that "Tetris" itself is a defended trademark.

---

## Where Claude was wrong, and who caught it

| What went wrong | Caught by | How |
|---|---|---|
| Wrote "her" and "his" for people I never described that way | Claude, reading the bot's output in the browser | Changed to neutral wording. I had given pronouns for Jake, Alyssa and Brad only |
| Mock responses keyed to event ids couldn't survive a realistic calendar | Claude, while building | Replaced with rule-based functions plus fixtures only for teaching (D20) |
| Teaching the same thing twice stacked duplicate facts | Claude, clicking through the app | Same person or rule now replaces the old one |
| A 3B model doubled "an hour" to 120 minutes | Claude, running the real model | Code now reads the amount from my sentence (D27) |
| Asked to import one calendar, the model imported all five teammates | Claude, running the real model | The model only picks the intent; code reads names and calendars |
| The model explained a slot with times it was never given | Claude, reading real output | Reasoning with a time not in the data is replaced by code |
| Rating the week with the model took 75 to 83 seconds and every answer failed validation | Claude, reading the LLM trace | Rating is rules plus taught facts by default (D26) |
| Setting a different Ollama context size froze every request | Claude, timing a benchmark beside the app | Never set it |
| **The "Apply" and "Brief me" buttons did nothing.** Claude had attached the new props to the wrong component | Claude, in the browser; the console said `onApply is not a function` | Moved the props. **All 109 automated checks had passed**: they test the logic, not the screen |
| Duplicate React keys (the same prompt appeared twice in a list) | Claude, in the browser console | Deduplicated |
| Went along with "Pascal" without checking it was taken, and left a placeholder button suggesting "Loom" (also an existing product) | **Me** caught Pascal; Claude flagged the Loom button itself | Claude can't check trademarks or domains; I have to |
| Moved meetings can land back-to-back with another meeting | Claude (documented, not fixed) | Open: the fix takes the first free slot, not the roomiest |
| Shell tooling kept corrupting regular expressions (backslashes) in files Claude wrote | The build and the checks failing | Rewrote the affected files through the file editor instead |

## What the intermediate steps look like, if you want to see them

- **The model's calls, with inputs and outputs:** open the app with `?dev=1` and use **Show LLM trace**. Rows marked "fell back" are calls where code repaired or replaced the model.
- **The checks:** `npm run check:flow` runs 109 assertions, including each guardrail above.
- **Prompt text before and after:** `12-prompt-iterations.md`.
- **Why each choice was made:** `06-decisions.md` (D1 to D30), in order.
- **The earlier chat:** `01-conversation-log.md`, turns 1 to 14 (it was reconstructed from a previous conversation after the fact, as noted there).

## What I did not verify

- Everything runs on **sample data**: hardcoded Outlook-shaped JSON, not my real calendar. Nothing is written back to Outlook.
- The Claude API provider has **never been run**.
- Model timings and quality are from **one laptop** with one small model.
- I haven't tested narrow or mobile layouts, or the bump booking path through a real-model ranking.
- There is **no measured time saving** yet. That needs a manual timing baseline.

---

## Appendix: my messages in this phase, verbatim

1. *(Project brief; condensed in `01-conversation-log.md` turn 15.)*
2. "Create a new branch for htis"
3. "Commit the working tree changes with a sensible message."
4. "This is great. Let's make the following changes:

   1) There should be separate apps for "new" and "filled out" (words will vary). Basically, I want to show the final product, but I want a fresh screen where I can show importing different calendars, adding context, prompting for new meetings, etc. I want to have both, as then I can show the final product.
   2) I really want an LLM connected. ollama is good, I already have it installed on my machine. I'm thinking to not have a separate knowledge base stored for each, but rather one that I can prompt an LLM for context of.
   3) I want check boxes to show my different calendars, and a separate tab where I can click through my teammates, and a view where I can compare. This will allow me to maximize functionality.
   4) The flight example should be from Monday at 5:00 PM from ORD to LGA, with an hour buffer each way automatically.
   5) The eprsonal calendar is good. Also, provide me prompts that I can use to add the context for each we suggested. Basically, I want you to have an exact walkthrough of what I should do for the demo. I don't want to have to type everything. I should just be able to copy and paste everything in to transform the blank screen to the final copy."
5. (Sent while Claude was working) "There should also be the following features:
   1) I should be able to add teammates. These shouldn't already be there. Then, separately, I can add calendars to the teammates.
   2) Remove the knowledge base module view on the home screen. It should be included in the assistant that I can prompt.
   3) [pasted: Fresh start / Finished product / Demo script / Summary] are separate tabs. That shouldn't exist. It should just be the one tab. I want to be able to load two separate apps, one that is new and one that is completed. The demo script should then give complete instructions of how to get from the new screen to the "Finished Product". Again, we have an entire codebase, so I can do what I want from there. The product should be what to show the user. Also, for the demo script, it should be divided as I had the four features above. First is improting my calendars, second is adding my context, third is adding team members and their calendars, fourth is adding context into the knowlege base, fifth is showing how we can schedule meetings. Again, each person is unique, so a prompt like "Priya is in Bengalaru and only works 8 am - 12 PM ET" is important context. The goal is to show teams are messy, and this helps you manage them."
6. "Commit the working tree changes with a sensible message."
7. "Ok how to see the new app? local host url?"
8. "Ok this is great. More updates:

   1) Can you remove the ollama connected? Assume this application is what someone would see.
   2) Add a return flight 8:00 PM to 10:00 PM on Thursday.
   3) Margin is a bad name. Can we instead call is Pascal? I'm thinking it's an abbreviation for Passive Calendar, but I'm open to another suggestion.
   4) The goal is to make this a fully holistic platform. The initial calendars should have overlapping events and such. Also, the goal is this is an interactive AI agent that handles things for you. I'm open to additional suggestions that could be helpful."
9. (Sent while Claude was working) "Can you help me think of a new name? There is already a Pascal AI  :("
10. "oh is there something I can do with with Tetris? Like piecing it together?"
11. "Tessera is good"
12. (The capstone description, pasted, with the question: "for a school project, do you think it is good to go?")
13. "Ok, so you don't think I need to update the model further? Also, a key part of this project is interacting with AI, showing the intermediate steps and what I had to guide you towards. Can you make sure that is in the documentation?"
