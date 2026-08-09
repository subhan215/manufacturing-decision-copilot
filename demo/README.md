# Demo

Drop the recording here.

## Read this before committing a video file

**A video file probably should not live in this repository.** GitHub rejects any file over 100 MB, warns above 50 MB, and a screen recording of four minutes routinely lands between the two. Git also stores binaries badly — the file is kept whole in history on every change, so the repository stays large even if you delete it later.

For the submission, the portal wants a **link**, not a file. So:

1. Upload the recording to **YouTube (unlisted)** or **Loom**.
2. Paste that link into the portal's *Project Links* field.
3. Optionally record the link at the bottom of this file so the repository points at it too.

If you do want the file in the repository anyway — as a backup, or because a link is not acceptable — keep it under 50 MB. Handbrake or `ffmpeg -vcodec libx264 -crf 28` will get a four-minute 1080p screen capture there comfortably.

## The script

`../docs/DEMO_SCRIPT.md` — four minutes, timed, with every figure verified against the committed snapshot. There is a verified-figures table at the bottom to check against while recording.

## If there is no time to record

**A video is not mandatory.** The Sofstica criteria ask for *one or more* of: a live application/demo, a demo video, **or** presentation slides / supporting documentation. Any one satisfies the requirement.

What this repository already provides for that field:

- `../docs/slides.pdf` — ten-slide deck
- `../README.md` — what was built, the problem, how it works, what to improve
- `../eval-results/scorecard.md` — the full quantitative evaluation
- `./CASE_WALKTHROUGH.md` — the three required cases, documented against real output

The challenge brief separately requires *"a demonstration of one successful case, one ambiguous or conflicting case, and one failure or fallback case."* It does not say that demonstration has to be a video. `CASE_WALKTHROUGH.md` covers all three with the actual verdicts, quotes and reasoning, so the requirement is met either way — a video would make it more persuasive, not more complete.

---

## Recording link

<!-- Paste the YouTube or Loom URL here once uploaded. -->

_Not yet recorded._
