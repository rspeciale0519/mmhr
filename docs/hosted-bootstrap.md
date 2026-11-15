# Hosted Super Admin bootstrap

This runbook makes the first two Super Admins on the hosted development project `mmhr` (`mslbuffwyuckfmgoyivj`).
You do it one time. The script refuses every other project and refuses a bootstrap that is already complete.

You need about 30 minutes. Do steps 13 to 18 in less than one hour, because each staff session ends after one hour.

## Why staff do not use `/sign-up`

Do not use the app `/sign-up` or `/sign-in` pages for the two staff accounts before the bootstrap is complete.
Before a user has a staff role, each app sign-in makes a customer workspace ("Your software search") for that user.
`/sign-up` also records the user as a sales lead.
That workspace and that customer registration stay for the life of the account.
After the bootstrap, staff sign in to the app normally. The app then makes no customer workspace for them.

## What you need

- Two email addresses, one for each staff member. Each person must be able to read that mailbox later.
- An authenticator app on a phone (for example Google Authenticator, Microsoft Authenticator, or 1Password).
- Access to the Supabase dashboard for the `mmhr` project.
- PowerShell 7 in Windows Terminal, opened at the repository root.

## Part 1: Prepare your terminal

1. Open Windows Terminal with PowerShell 7. Go to the repository root.
2. Type `Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue`.
   This removes an old token that can override your Supabase login.
3. Type `supabase projects list`.
   Success: the list shows `mmhr` with the reference `mslbuffwyuckfmgoyivj`.
   Failure: type `supabase login`, finish the login in the browser, and do this step again.
4. Type `npm ci`.
   Success: the command ends without an error.

## Part 2: Check the hosted Auth settings

5. In the Supabase dashboard, open the `mmhr` project. Go to **Authentication**, then **Multi-Factor**.
   Make sure that **TOTP (App Authenticator)** is enabled. If it is off, turn it on and save.
6. Go to **Authentication**, then **Sign In / Providers**, then **Email**.
   Set **Minimum password length** to `12` and save. The app uses the same rule.

## Part 3: Make the two staff users

7. Go to **Authentication**, then **Users**. Click **Add user**, then **Create new user**.
8. Type the email of staff member 1. Type a strong password with 12 or more characters.
9. Select **Auto Confirm User**. Click **Create user**.
10. Do steps 7 to 9 again for staff member 2. Use a different email.
    Success: both users show in the list, and neither shows "Waiting for verification".

Keep each password in your password manager. Do not write a password in a file or a chat.

## Part 4: Get each identity and session

11. Type this command. Type `$first =` at the start, as shown:

    ```powershell
    $first = node scripts/hosted-bootstrap-super-admin.mjs session --project-ref mslbuffwyuckfmgoyivj
    ```

12. When the command asks, type the email of staff member 1. Then type the password. The password does not show.
13. The first time, the command shows a **Setup key**. In the authenticator app, add a new account with
    **manual entry** (time-based). Type the setup key. Then type the six-digit code from the app into the terminal.
    Success: the terminal shows `Identity id: <id>` and the time when the session ends.
    Write down the identity id for staff member 1. The id is not a secret.
    The session token goes into `$first`. It does not show on the screen. Do not print `$first`.
14. Do steps 11 to 13 again for staff member 2, but start the command with `$second =`.
    Write down the identity id for staff member 2.

## Part 5: Prepare the bootstrap

15. Choose two approval references. Use only letters, digits, and `. _ : / -`. Start with a letter or a digit.
    The two references must be different. Example: `product:owner-2026-11-14` and `security:owner-2026-11-14`.
16. Type this command. Put the identity id of staff member 1 in the first line and of staff member 2 in the second line:

    ```powershell
    @{
      firstTargetIdentityId    = "<identity id of staff member 1>"
      secondTargetIdentityId   = "<identity id of staff member 2>"
      productApprovalReference = "product:owner-2026-11-14"
      securityApprovalReference = "security:owner-2026-11-14"
      correlationId            = (New-Guid).Guid
    } | ConvertTo-Json -Compress | node scripts/hosted-bootstrap-super-admin.mjs prepare --project-ref mslbuffwyuckfmgoyivj
    ```

    Success: the terminal shows `Bootstrap prepared.`

## Part 6: Complete the bootstrap

17. Type this command. `$first` must belong to staff member 1, the first identity in step 16:

    ```powershell
    @{ firstAccessToken = $first; secondAccessToken = $second; correlationId = (New-Guid).Guid } | ConvertTo-Json -Compress | node scripts/hosted-bootstrap-super-admin.mjs complete --project-ref mslbuffwyuckfmgoyivj
    ```

    Success: the terminal shows `Bootstrap completed. Two Super Admins are active.`
18. Type `Remove-Variable first, second`. Then close the terminal window.

## Part 7: Check the result

19. Open a new terminal. Type these commands:

    ```powershell
    New-Item -ItemType Directory -Force "$env:TEMP\mmhr-empty" | Out-Null
    supabase db query --remote=mslbuffwyuckfmgoyivj --read-only --workdir "$env:TEMP\mmhr-empty" "SELECT state FROM public.security_bootstrap_state"
    ```

    Success: the result shows `consumed`.
20. Each staff member can now sign in to the app at `/sign-in`. Then open `/mfa`, click **Verify factor**, and type the code.

## If something fails

The script stops and changes nothing when a check fails. It never prints a token, a key, or a password.

| Message | What to do |
|---|---|
| `is not an approved hosted bootstrap target` | Check the project reference. Use `mslbuffwyuckfmgoyivj`. |
| `CLI did not confirm target` | Do steps 2 and 3 again. |
| `Sign-in failed` | Check the email and the password. In **Authentication > Users**, make sure the user is confirmed. |
| `Could not start TOTP enrollment` | Do step 5 again. |
| `The code was not accepted` | Wait for the next code and run the step again. If a new setup key shows, remove the old entry from the authenticator app first. |
| `Could not create or read the identity record` | Run `supabase db query --remote=mslbuffwyuckfmgoyivj --yes --workdir "$env:TEMP\mmhr-empty" "NOTIFY pgrst, 'reload schema'"`. Then do the session step again. |
| `needs an interactive terminal` | Run the command in Windows Terminal. Do not pipe input into the session step. |
| `Capture the output in a variable` | Start the command with `$first =` or `$second =`. |
| `already prepared` | If the two ids are correct, go to step 17. If an id is wrong, stop and ask an engineer. |
| `already consumed` | The bootstrap is complete. Nothing to do. |
| `wrong order` | In step 17, change the places of `$first` and `$second`. |
| `require current AAL2 claims` | A session ended. Do steps 11 to 14 again. You only type the code this time. Then do step 17. |
| `The query was refused: ... Security command denied` | A database check failed, for example a session ended. Do steps 11 to 14 again, then step 17. If it fails again, stop and ask an engineer. |

## Hosted Auth settings for customer sign-up

The staff bootstrap does not need email delivery. Customer sign-up on hosted staging does. Set these in the
dashboard under **Authentication > URL Configuration** and **Authentication > Emails** before customer tests:

- **Site URL**: the app address, for example the Vercel preview address. The confirmation email returns the user to this address.
- **Redirect URLs**: the app address, `<app address>/invitations/accept`, and `<app address>/auth/agentid/callback` if AgentID sign-in is used.
  The app has no `/auth/confirm` route. Sign-up sends no custom redirect, so the email link uses the Site URL.
- **Confirm email**: on (**Sign In / Providers > Email**).
- **SMTP**: set a custom SMTP sender. The built-in sender sends only to members of the Supabase organization, and it has a very low hourly limit.

Do not run `supabase config push` with the repository `supabase/config.toml`. That file holds local values
(for example `site_url = "http://127.0.0.1:3100"`), and the command writes every value that the file declares.
