# Staff Vendor Entry

This runbook puts one vendor product into customer comparisons. No vendor user signs in.
Owner decision, 2026-11-16: MMHR staff enter vendors. Most vendors never join; MMHR sends them the RFP (2026-11-17).
Product rule: [PRD.md](./PRD.md) FR-VND-09 and FR-IAM-11. Launch order: [LAUNCH.md](./LAUNCH.md).

## Who can do each step

| Step | Who |
|---|---|
| Add vendor, open workspace, add product, record evidence | Staff with `admin.access` and two-step sign-in |
| List vendor, approve catalog profile, approve evidence | Super Admin with two-step sign-in (`audit.export`) |

Every step writes an audit event. The app sends no email.

## Steps

1. Open `/admin/vendors`. Under "Add vendor", enter the company name and select "Add vendor".
   The vendor shows "Not listed" and "Not joined".
2. As a Super Admin, enter a reason, for example the source you checked, and select "List vendor".
   The vendor becomes "Listed". If listing is refused, check two-step sign-in at `/mfa`, sign in again, and reload.
3. Select "Open vendor workspace". The app selects the vendor workspace and opens `/admin/vendor-evidence`.
   The staff grant is a viewer membership. It never gives vendor portal access.
4. Under "Add product", enter a product name and a product key, for example `payroll_core`. Select "Add product".
   The product starts as a draft.
5. Under "Catalog products", tick the check and select "Activate" with the product name.
6. Under "Vendor catalog approval", enter a review reference and a reason, tick the check, and select "Approve vendor for catalog".
7. Under "Record a new vendor fact", select "Save evidence draft" once for each scored requirement key:
   - Product: the new product.
   - Record type: "Capability or estimate". Approved field key: the requirement key, for example `input_payroll`. Fact value: for example `yes`.
   - Official source URL: an `https://` address. Other schemes are refused.
   - Source capture date: a past time. Evidence expiry (`fresh_until`): a future time. Expired evidence leaves comparisons.
   - Evidence notes: the text on the source that supports the value.
8. Record the scope fact for the same product. Record type: "Package and regional conditions".
   Add one condition for each scored key. Capability key: the requirement key. Condition type:
   "No restrictions confirmed by source", when the source confirms it. The stored value is then:
   `{"input_payroll":{"version":1,"conditions":[]}}`.
   The staff publication at `/admin/evaluations` uses configuration version 2, which reads this scope fact.
   Without a scope fact for a scored key, comparison results show "Unknown" for that key.
9. Under "Saved evidence", select "Approve evidence" and "Save review decision" for each record. The fact becomes published.
10. Check the comparison. The next customer evaluation publication includes the product.

## What keeps a product out

- The vendor is not listed, or it is suspended or archived. A vendor that needs migration review cannot be listed.
- The catalog profile is not approved, or the product is not active.
- The fact is not approved, its source is not `https://`, or its evidence has expired.

## When a customer picks the vendor

Owner decision, 2026-11-17: most vendors never join the app. MMHR sends the RFP out.

1. Approve the RFP.
2. Send the RFP to the vendor's contact by email. The response deadline starts at delivery.
3. In the vendor workspace, record the send, the due date, each follow-up, and the reply when it arrives.
4. Rare case: if the vendor wants to answer in the portal, invite its first user at `/admin/vendors`.
   The person sets up two-step sign-in at `/mfa`, then accepts at `/invitations/accept`. The invitation expires after 72 hours.

Steps 2 and 3 are not built yet. See launch task 3 in [LAUNCH.md](./LAUNCH.md).

## Recovery

- To stop staff access to one vendor workspace, revoke its grant in a reviewed transaction. See the end of `drizzle/0179_staff_vendor_listing.sql`.
- To take a listed vendor out of comparisons, suspend or archive it through the organization status command.
