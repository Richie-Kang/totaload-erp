# Part 2 · Competitive Analysis — 3-minute screen-recording script

**Duration target:** 3:00 (~430 spoken words at 145 wpm).
**Audience:** an enterprise customer evaluating OCR vendors for a Korean document-heavy workflow.
**On screen:** [https://totaload-frontend.onrender.com](https://totaload-frontend.onrender.com) in one tab, the HTML comparison deck (`submissions/competitor-comparison.html`) in a second tab.

Stage directions are in `[brackets]`. Spoken lines are the lines you read.

---

### [0:00 – 0:20] Open · the customer problem

`[Tab 1: Totaload OCR — sidebar visible, "말소 입력" highlighted. Drag the sample certificate over the dropzone but don't drop yet.]`

> **"Hi. I'm going to walk you through a real customer scenario — picking an OCR provider for a Korean used-car exporter. They process about thirty vehicles a day. Each one requires the operator to hand-transcribe twelve fields from a paper registration certificate into a government deregistration form. We need an OCR that can do that in under ten seconds, every time, including the Korean resident-registration number and a corporate owner address. I evaluated three: Upstage Document Parse, OpenAI Codex with vision, and Google Gemini 2.5 Flash."**

---

### [0:20 – 0:45] Setup · same image, three engines

`[Highlight the OCR-engine selector in the top-right of the page. Hover over each of the three logos in turn.]`

> **"What you're looking at is Totaload OCR. The same upload can be processed by any of three providers — Upstage, Codex, or Gemini — and the result feeds the same downstream PDF. So the only variable in this comparison is the OCR engine."**

---

### [0:45 – 1:20] Upstage demo

`[Select "Upstage". Drop assets/samples/자동차등록증_레이.jpg. Stay silent for the ~3.5s spinner. When the form auto-fills, point at three specific fields with the cursor: owner_name, owner_ssn, owner_address.]`

> **"Three and a half seconds. Nine fields populated. The VIN is seventeen characters as the spec requires. The resident-registration number is in 6-7 format, and notice that the owner name and the address are correctly split — even on the corporate certificate where they're printed on the same line in the source document.
> Behind the scenes, Upstage runs a two-step pipeline: Document Parse extracts layout-aware text, then Solar Chat structures it into our JSON schema. We get deterministic JSON, every time, and the Korean form labels are recognized natively."**

---

### [1:20 – 1:50] Codex demo

`[Switch the engine to "Codex". Drop the same certificate. While the ~25-second wait happens, narrate over the spinner.]`

> **"Same image, switching to OpenAI Codex. Codex is the GPT-5 family's vision CLI, billed through a ChatGPT subscription.
> ...about twenty-five seconds. It found most of the fields, but the latency is a deal-breaker for an operator doing thirty cars a day. And the authentication model — bundling a personal `auth.json` into a server container — is a non-starter for any production deployment. We use Codex as a free fallback, not as a primary."**

---

### [1:50 – 2:25] Gemini demo

`[Switch to "Gemini". Drop the same image. Should return in ~2-3s.]`

> **"Last one. Gemini 2.5 Flash, a single multimodal call. Two and a half seconds — the fastest of the three.
> But here's the catch you'd hit in production: Gemini's default safety filters block this image outright. Korean registration certificates carry resident-registration numbers and home addresses, which trigger the PII heuristics. To get this demo working, we had to set every safety category to `BLOCK_NONE`. For a compliance-heavy customer — a bank, an insurer, a government processor — that's a hard sell."**

---

### [2:25 – 2:55] Trade-offs · the comparison deck

`[Switch to Tab 2 — the HTML comparison deck. Let the viewer see the full table for ~3 seconds, then point at the highlighted "Upstage wins" rows.]`

> **"Putting them side by side: Gemini wins raw latency but needs explicit safety overrides for any document with PII. Codex is the cheapest if you already pay for ChatGPT, but at twenty-plus seconds per cert it's too slow for a desk operator. Upstage wins on what actually matters for this customer — it's deterministic, it's fast enough, it's trained on Korean documents out of the box, and the integration is one API key. No subprocess, no safety overrides, no `auth.json` mounts."**

---

### [2:55 – 3:00] Close

`[Cursor back on the Upstage logo in Tab 1.]`

> **"For this customer, Upstage isn't a tie. It's the only one we'd put in front of operators on day one. Thanks for watching."**

---

## Recording checklist

- [ ] Cold-start warmup: open both tabs and process **one throwaway upload per provider** five minutes before recording so the Render free-tier containers are warm. Otherwise the first upload will hit a 30–60 s cold start.
- [ ] Display: 1080p+ (1440p preferred), 16:9, dark menu bar off, browser zoom 110–125% so text reads on playback.
- [ ] Mic check, then a quiet 2-second tail before "Hi." and after "Thanks for watching".
- [ ] Sensitive data: the sample certificates in `assets/samples/` are test images, but if you record with a real customer cert, **blur the resident-registration number and the plate** in post.
- [ ] Mask any Render hostnames you don't want public if needed (the demo URL itself is fine — it's already in the README).
- [ ] Upload to **YouTube unlisted** or **Google Drive (anyone with the link can view)** and paste the link into the submission email.
