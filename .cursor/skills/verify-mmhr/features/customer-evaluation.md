# Customer evaluation

A customer with a submitted intake sees every published vendor option with names hidden, then saves at most five initial choices. Option numbers are labels, not rank. Saving choices does not contact providers or send an RFP.

## Sub-features

- `evaluation-empty` on `/customer/evaluation?intake=<uuid>` shows `No approved comparison is available yet` when staff have not published.
- `evaluation-matrix` shows heading `Compare your software options` and region `Software comparison` with masked labels.
- `evaluation-select` ticks `Choose <maskedLabel>`, then `Review choices`, checkbox `Save these initial choices`, and `Save choices`.
- `evaluation-cap` keeps a maximum of five initial choices (`5 of 5 initial choices used` / remaining count).
- `evaluation-saved` lists `Saved initial choices` and offers `Continue to RFP and provider review` only after at least one saved choice.

## How to get to it (user POV)

- From a saved intake choose `View software comparison` (`/customer/evaluation?intake=<uuid>`).
- Open that URL directly while signed in as that customer.
- After choices, choose `Continue to RFP and provider review` (`/customer/rfp?intake=<uuid>`). Provider names stay hidden until staff record disclosure.

## Driving it with Playwright

Preconditions:

- Full launch. Doctor `ready: yes`.
- The customer intake journey has a **submitted** intake.
- Staff have published an approved comparison for that intake from `/admin/evaluations`. Seed data does not include a publication.
- If publication is missing, open the evaluation URL anyway, capture `No approved comparison is available yet` or `We could not load the current comparison`, and **fail** this feature. Do not publish from the customer browser, and do not call staff tRPC from this recipe.

- **Open comparison.** From the submitted intake choose `View software comparison`. Heading `Compare your software options` is visible. Region `Software comparison` is visible. No legal vendor name (Gusto, Rippling, ADP, and so on) appears in the option headings; labels are masked (`Option 1` style). Screenshot the matrix.
- **Choose one option.** Tick `Choose <maskedLabel>` on an option that is not already `Choice saved`. Choose `Review choices`. The review list shows that masked label. Tick `Save these initial choices`. Choose `Save choices`. Status `Your choices are saved.` appears.
- **Confirm persistence.** Choose `View saved choices` or reload. `Saved initial choices` lists that masked label. Count text includes `of 5 initial choices used`.
- **Proof.** Screenshots of the matrix before save, the review step, and the saved-choices list. Confirm the HTML still has no provider legal name in option headings.

End state that proves it works: the matrix rendered with masked labels, one saved initial choice visible after reload, and the remaining-choice count decreased.

## Gotchas

- Empty seed plus no staff publication: the page is reachable and the empty status is correct, but the feature is **not verified**. Record `verified-unreachable` with the missing publication, not a pass.
- `/customer/evaluation` without a valid `intake` UUID shows `This comparison link is not valid`.
- Draft intakes cannot select: `Submit your saved intake first. MMHR must review the comparison before you can choose options.`
- A sixth choice must be rejected by the server. Do not treat a disabled checkbox as enough; try to save more than five if four are already stored.
- Masking is the product. A screenshot that shows a vendor legal name in the option heading is a failure, not extra detail.
- `Continue to RFP and provider review` still hides names until disclosure. An empty `Provider names remain hidden until MMHR completes the discussion and records disclosure.` is expected without a staff disclosure record.
