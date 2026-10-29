# Demo script: from the new app to the finished product

Generated from `src/data/demoScript.js` by `npm run gen:demo`. The same script is on the page `/demo.html` with copy buttons. Edit the data file, not this one.

Follow the steps in order; later steps depend on earlier ones. A code block is a prompt to paste into the assistant. Everything else is a click or a point to make. Open the new app at `/fresh.html` and keep the finished app at `/` next to it.

## Before you start

- Run `npm run dev` and open http://localhost:5173/fresh.html (the new, blank app). Keep http://localhost:5173/ open in another window: that is the finished product to compare against.
- Top right should say **Ollama connected** and show a model (for example llama3.2). If it says not reachable, start Ollama; the app still works by falling back to canned answers, but it won't be a live model.
- Timing on a CPU with a 3B model (llama3.2): a short answer takes 3 to 10 seconds, teaching one sentence 10 to 25 seconds (so the five-line paste in Part 4 takes one to two minutes), and a ranked list of meeting options 10 to 45 seconds. The first call after Ollama has been idle can take longer while it loads the model, so send "hello" to the assistant first. If the room can't wait, switch **Model** in the header to **Mock** for the slow steps and back again; the screens are identical.
- A small model is the weakest part. Code checks everything it returns (names, numbers, times, working hours), so a bad answer is repaired or replaced and the **LLM trace** says so, but its wording will sometimes be clumsy. That is expected.
- If you've been through the script already, click **Reset to blank** to start over.

## Part 1. Import my calendars

_You have three calendars (work, personal, a club) and nobody sees all of them. One master view, and a fix for what colleagues can't see._

### 1. Start from nothing

Point at the blank week, the empty Calendars panel and the empty team list.

> Say: This is a new user. No calendars, no team, nothing taught.

### 2. Import all three calendars

```text
Import my work, personal, and club calendars
```

**You should see:** Three calendars connect (Work 18 events, Personal 5, Club 3) and the week fills in. The Calendars panel says 8 events are on one calendar only.

### 3. Show and hide calendars

Untick Personal above the grid: the Monday and Thursday flights, the dentist and the lunch disappear. Tick it again.

> Say: One master view, with a checkbox per calendar.

### 4. Spot the problems no one can see

Look at Heads-up under the calendar. Friday's club recruiting panel double-books the team retro: two calendars, one slot.

> Say: That conflict only exists because the calendars are merged. Today nobody can see it.

### 5. Make everything visible to colleagues

```text
Sync my calendars
```

**You should see:** "Wrote 8 private Busy blocks to your other calendars", listing your flights, lunch, dentist, apartment tour and the club events. The sync warning on the left turns green.

> Say: Colleagues only see your work calendar. Now your personal and club time shows up as Busy, with no titles.

## Part 2. Add my own context

_Rules that are about you, not about a person. Your flights flow in automatically, but you need an hour either side._

### 1. Teach the flight rule

```text
When you see a flight, hold an hour before and an hour after it.
```

**You should see:** Hatched Soft hold bands appear next to each flight. Monday 4:00 to 5:00 PM sits right before the 5 PM ORD to LGA flight (the hold after landing, 7:10 to 8:10 PM, is past the bottom of the grid), and Thursday evening is held before the return flight. Heads-up now says the 1:1 with Sarah sits inside the flight soft hold.

> Say: I never had to tell it about the flights. They came from Outlook. I only told it how I travel.

### 2. See that it was saved

Open **Knowledge base** at the top of the assistant. The rule is there in your words, with the structure underneath (60 minutes before, 60 after, on every flight).

## Part 3. Add team members and their calendars

_People and calendars are separate. Adding a person doesn't connect their calendar, and each person is a different shape._

### 1. Add the people

```text
Add Jake, Alyssa, Brad, Sarah, and Priya as teammates
```

**You should see:** Five teammates are added to Your team, each marked "no calendar".

### 2. Add their calendars

```text
Add calendars for Jake, Alyssa, Brad, Sarah, and Priya
```

**You should see:** Each calendar connects (Jake 21 events, Alyssa 11, Brad 6, Sarah 17, Priya 12).

> Say: In real life this is an Outlook sign-in per person.

### 3. Click through the team

Click the **Teammates** tab (top left of the app). Click Jake: a packed week with five flights, one entered in Pacific time while he's in San Francisco. Click Alyssa: a light week. Click Priya: grey rows show when she's outside her calendar's working hours.

### 4. Compare calendars

Switch to **Compare**, untick Brad, Sarah and Priya (leave You, Jake and Alyssa), and pick Tuesday. The green bands are the time all three of you are free inside everyone's working hours: 1:00 to 2:30 PM and 3:30 to 4:00 PM Central.

### 5. Include Priya

Tick Priya too. Everything is shown in your time (CT). Her calendar says 9 AM to 6 PM India time, which never overlaps your day: her whole column is shaded and the green bands disappear.

> Say: This is where teams get messy. Her calendar says one thing, and I know it's wrong.

## Part 4. Add context to the knowledge base

_The calendar can't tell you who is a client or that someone only works mornings. You can, once, in plain English._

### 1. Try Priya before teaching anything

Click the **Calendar** view again, then ask:

```text
I need 30 minutes with Priya. What times work?
```

**You should see:** No times. The assistant says it can't find 30 minutes inside everyone's working hours, notes Priya's calendar shows no overlap with your day, and suggests telling it Priya's real hours.

> Say: Honest, but useless. Let's fix it with what I know.

### 2. Teach the whole team in one paste

```text
Jake is a partner. Keep buffers around meetings with him.
Alyssa is my main peer. Her meetings can be rescheduled with ease.
Brad is a client. Never reschedule a meeting with him.
Sarah is my direct manager.
Priya is in Bengaluru and only works 8 AM to 12 PM ET.
```

**You should see:** One confirmation per line. Open **Knowledge base**: five entries, with the structure under each (Jake: high priority plus a 15 minute buffer rule; Alyssa: flexibility high; Brad: never reschedule; Priya: location Bengaluru, works 08:00 to 12:00 America/New_York).

> Say: Each person is unique. Priya is in India but works Eastern mornings. Brad is a client who never moves.

### 3. Ask the knowledge base

```text
What do you know about Priya?
```

**You should see:** The assistant answers from what you taught plus her profile, including that only 9 to 11 AM Central overlaps your day.

### 4. Ask a question across the team

```text
Who should I be careful about rescheduling?
```

**You should see:** An answer drawn from the knowledge base: Brad (never reschedule) first, Jake (partner, buffers) next. This is the step where a small model is weakest and may give a terse or partial list; it's fine to skip it.

### 5. Retry the same request

```text
I need 30 minutes with Priya. What times work?
```

**You should see:** Now there are options, all between 9 and 11 AM Central, each showing the time in Bengaluru (IST) in the callouts.

> Say: Same calendar, same question. The only difference is one sentence of context.

### 6. Re-check the Compare view

Go to **Teammates > Compare**, tick only You, Jake, Alyssa and Priya, and pick Wednesday. Priya's column now shows working hours of 7 to 11 AM Central (8 AM to 12 PM Eastern), and a green band appears at 9:30 to 11:00 AM: the one window all four of you share.

## Part 5. Schedule meetings

_Everything above is what lets one sentence produce a good meeting._

### 1. A three-person meeting with a partner and a client

```text
Schedule a meeting with Jake, Alyssa, and Brad
```

**You should see:** The assistant lists what it's applying (Jake a partner, buffers; Alyssa flexible; Brad never rescheduled and on Pacific time), then three options with callouts: local times for Jake and Brad, any soft hold, any gap problem in Jake's calendar. Hover an option to preview it on the calendar.

### 2. Book it

```text
Book option 1
```

**You should see:** A Booked card: created on the Work calendar, a Zoom link because a client is invited, Busy blocks written to Personal and Club, invites to each person with their local time. It appears on the calendar, and Jake, Alyssa and Brad's overlays show it too.

### 3. A peer meeting where something has to move

```text
Find 45 minutes with Alyssa and Sarah on Tuesday
```

**You should see:** Three options. One of them puts the meeting on top of Tuesday's Model review with Alyssa and says "Moves Model review to ...", because Alyssa's meetings move easily. Book the one that shows the move (with the mock it is option 3: "Book option 3"; with a live model the order can differ, so read the cards first).

### 4. An invite arrives

Click **Simulate an incoming invite** (right column). Brad invites you Monday 4:15 PM: it's inside the soft hold before your 5 PM flight and on top of your 1:1 with Sarah.

**You should see:** Advice: Brad is a client, so accept, and deal with the 1:1 and the flight timing.

### 5. Compare to the finished product

Open http://localhost:5173/ (the finished app) next to this one. Same calendars, team, knowledge base and soft holds (minus the meetings you just booked). Click **Show LLM trace** to see every model call you just made.

> Say: That's the whole product. Calendars, rules, people, context, and one place to ask.
