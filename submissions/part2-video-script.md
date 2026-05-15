# Part 2 · Competitive Analysis — 3-minute screen-recording script

**Duration target:** 3:00 (~330 spoken words at ~130 wpm — relaxed pace, room to breathe).
**Audience:** an enterprise customer choosing an OCR vendor for Korean documents.
**On screen:** [https://totaload-frontend.onrender.com](https://totaload-frontend.onrender.com) in one tab, the comparison deck (`submissions/competitor-comparison.html`) in a second tab.

Stage directions are in `[brackets]`. Spoken lines are what you read.

---

### [0:00 – 0:20] Open · the problem

`[Tab 1: Hanaru AI ERP — sidebar visible. Drag the sample certificate over the dropzone, don't drop yet.]`

> **"Hi. I'd like to show you how I picked the best OCR for a real customer — a Korean used-car export company. Every day, a worker types twelve fields from a paper registration into a government form. About thirty cars a day. We need an OCR that finishes in under ten seconds, every time. I tested three: Upstage, OpenAI Codex, and Google Gemini."**

---

### [0:20 – 0:35] Setup · same image, three engines

`[Hover over the OCR-engine selector in the top-right. Show all three logos.]`

> **"This is Hanaru AI ERP. The same upload can run through any of the three engines. Same image, same form. The only thing changing is the OCR engine."**

---

### [0:35 – 1:10] Upstage demo

`[Pick "Upstage". Drop assets/samples/자동차등록증_레이.jpg. Wait quietly for ~3.5s. When the form fills, point at three fields: owner_name, owner_ssn, owner_address.]`

> **"Let me try Upstage first.
> ...Three and a half seconds. All nine fields are filled in. The VIN is correct, the ID number is in the right format, and notice — the owner's name and the address are split correctly, even though they're printed on the same line in the original document.
> Upstage works in two steps. First it reads the document. Then a second model turns the text into clean JSON. Same result every time."**

---

### [1:10 – 1:40] Codex demo

`[Switch to "Codex". Drop the same image. While the ~25s wait happens, narrate slowly over the spinner.]`

> **"Same image, this time with OpenAI Codex.
> ...About twenty-five seconds. Way too slow for someone doing thirty cars a day. And to make it run on a server, you have to mount a personal login file inside the container. That's not okay for a real product. So I keep Codex only as a backup."**

---

### [1:40 – 2:10] Gemini demo

`[Switch to "Gemini". Drop the same image. Should return in ~2-3s.]`

> **"Last one — Google Gemini. Two and a half seconds. The fastest of the three.
> But there's a catch. Gemini's safety filters block this image by default. Korean registration papers include ID numbers and home addresses — the filter sees those as sensitive. To make it work I had to turn off every safety category. For a bank or an insurance company, that's a serious problem."**

---

### [2:10 – 2:40] Trade-offs · the comparison deck

`[Switch to Tab 2 — the comparison deck. Let the viewer see the full table for ~3 seconds, then point at the "Upstage wins" rows.]`

> **"So which one wins?
> Gemini is fast, but you have to turn off safety filters. Codex is cheap if you already pay for ChatGPT, but too slow. Upstage is the right choice here. It's consistent. It's fast enough. It's trained on Korean documents. And setup is just one API key — no extra files, no safety overrides."**

---

### [2:40 – 3:00] Close

`[Cursor back on the Upstage logo in Tab 1.]`

> **"For this customer, Upstage isn't just one option of three. It's the only one I'd put in front of a real worker on day one. Thanks for watching."**

---

## Recording checklist

- [ ] **Cold-start warmup**: 5 minutes before recording, open both tabs and do one throwaway upload per provider so the Render containers are warm. Otherwise the first real upload will hang for 30–60 seconds.
- [ ] **Display**: 1080p+ (1440p preferred), 16:9, browser zoom 110–125% so text reads on playback.
- [ ] **Mic**: short check, 2 seconds of silence before "Hi" and after "Thanks for watching".
- [ ] **Sensitive data**: the sample images in `assets/samples/` are test data; if you record with a real customer's certificate, blur the resident-registration number and the plate number in post.
- [ ] **Upload to**: YouTube unlisted, or Google Drive with "anyone with the link can view". Paste the link in the submission email.
