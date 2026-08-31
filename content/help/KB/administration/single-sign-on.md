---
id: single-sign-on
title: Single Sign-On (SSO)
sidebar_position: 10
description: Let people sign in with your own identity provider — Microsoft Entra ID, Okta or Google Workspace — using SAML 2.0.
keywords: [sso, saml, okta, entra, azure ad, google workspace, identity provider, federation, security]
---

# Single Sign-On (SSO)

## Overview

Single sign-on lets your people sign in with the account they already have — the
one in Microsoft Entra ID, Okta or Google Workspace — instead of a separate
password here. Your directory stays in charge of who has access, which means
your existing multi-factor authentication, conditional access and joiner/leaver
process govern this system too. When someone leaves and you disable them in your
directory, they lose access here as well.

You configure this yourself, from **Settings → Security → Single sign-on**. You
do not need to contact us to enable it.

:::note What this does and does not do today
SSO **authenticates** people who already have an account here. It does not yet
create accounts automatically: invite the person first, then they sign in with
your provider. Automatic provisioning is planned for a later release.

Matching is by **email address** — the address your provider sends must match
the address on the account here.
:::

## Before you start

You will need:

- An administrator account in your identity provider that can create
  applications (an Okta admin, an Entra Global Administrator or Application
  Administrator, or a Google Workspace super admin).
- The **Manage security settings** permission here, or to be a company owner.
- The email domains your people sign in with, such as `acme.com`.

The whole setup is a two-way exchange that takes about ten minutes:

1. You give your provider three values from this page.
2. Your provider gives you back a metadata file.
3. You paste that file here, and turn the connection on.

## Step 1 — Give your provider our details

Open **Settings → Security → Single sign-on**. The panel headed *Give these to
your identity provider* holds three values, each with a copy button.

| What we call it | What your provider may call it |
| --- | --- |
| **Audience / Entity ID** | Audience URI, Entity ID, Identifier, SP Entity ID |
| **Sign-on URL (ACS)** | Single sign-on URL, Reply URL, ACS URL, Assertion Consumer Service URL |
| **Our metadata** | Metadata URL — import this and the other two fill themselves in |

These values are unique to your workspace and contain your own web address. Copy
them with the buttons rather than typing them: they must match exactly, and a
single wrong character produces a sign-in failure that is hard to read.

:::tip
If your provider offers to **import service provider metadata from a URL**, give
it *Our metadata* and skip the transcription entirely. Okta does not offer this;
Entra and Google both do.
:::

## Step 2 — Create the application in your provider

Follow the section for your provider, then come back to step 3.

### Microsoft Entra ID (formerly Azure AD)

1. In the [Microsoft Entra admin center](https://entra.microsoft.com), go to
   **Identity → Applications → Enterprise applications → New application**.
2. Choose **Create your own application**, name it (for example *Qability QMS*),
   and select **Integrate any other application you don't find in the gallery
   (Non-gallery)**. Click **Create**.
3. Open **Single sign-on** and choose **SAML**.
4. Edit **Basic SAML Configuration** and enter:
   - **Identifier (Entity ID)** — our *Audience / Entity ID*
   - **Reply URL (Assertion Consumer Service URL)** — our *Sign-on URL (ACS)*

   Leave *Sign on URL*, *Relay State* and *Logout Url* blank. Save.
5. Edit **Attributes & Claims** and confirm the **Unique User Identifier (Name
   ID)** is `user.mail` with the format **Email address**. If your users' `mail`
   attribute is not populated, use `user.userprincipalname` instead — but only if
   that is genuinely their email address here.
6. Under **SAML Certificates**, download **Federation Metadata XML**. (You can
   also copy the **App Federation Metadata Url** if you prefer to fetch it.)
7. Go to **Users and groups** and assign the people or groups who should have
   access. In Entra, an unassigned user cannot sign in even though the
   application exists — this is the most common reason a first test fails.

### Okta

1. In the Okta Admin Console, go to **Applications → Applications → Create App
   Integration**, choose **SAML 2.0**, and click **Next**.
2. Name the app (for example *Qability QMS*) and click **Next**.
3. On **Configure SAML**, enter:
   - **Single sign-on URL** — our *Sign-on URL (ACS)*
   - **Audience URI (SP Entity ID)** — our *Audience / Entity ID*
   - **Name ID format** — `EmailAddress`
   - **Application username** — `Email`
4. Under **Attribute Statements**, add one:

   | Name | Name format | Value |
   | --- | --- | --- |
   | `email` | Basic | `user.email` |

5. Click **Next**, then **Finish**.
6. On the app's **Sign On** tab, find **SAML Setup Instructions** (or the
   *Metadata URL*) and copy the **IdP metadata XML**.
7. On the **Assignments** tab, assign the app to the people or groups who should
   have access.

### Google Workspace

1. In the [Google Admin console](https://admin.google.com), go to **Apps → Web
   and mobile apps → Add app → Add custom SAML app**.
2. Name the app (for example *Qability QMS*) and click **Continue**.
3. On **Google Identity Provider details**, click **Download metadata**. Keep
   this file — it is what you paste in step 3. Click **Continue**.
4. On **Service provider details**, enter:
   - **ACS URL** — our *Sign-on URL (ACS)*
   - **Entity ID** — our *Audience / Entity ID*
   - **Name ID format** — `EMAIL`
   - **Name ID** — *Basic Information > Primary email*
5. On **Attribute mapping**, map **Primary email** to an attribute named
   `email`. Click **Finish**.
6. Open the app's **User access** panel and turn it **ON** for everyone, or for
   the organisational units that should have access. Google's change can take a
   few minutes to take effect.

## Step 3 — Add the connection here

Back on **Settings → Security → Single sign-on**, click **Add connection**.

1. **Name** — what appears on the sign-in button. Use something your people will
   recognise, such as *Okta* or *Microsoft*.
2. **Paste your IdP's metadata XML** — paste the whole file from step 2 and click
   **Read metadata**. We extract the entity ID, the sign-on URL and the signing
   certificates and fill in the fields below, so you can check them rather than
   type them.
3. **Email domains** — the domains this connection serves, comma separated, for
   example `acme.com, acme.co.uk`. We match on the domain to decide who this
   provider signs in.
4. Click **Save & activate**.

Finally, turn on the master switch at the top of the page: **Enable single
sign-on for this workspace**.

If your provider does not publish metadata, fill in **IdP Entity ID**, **IdP
sign-on URL** and **Signing certificate** by hand — they are the same three
values the metadata contains.

## Step 4 — Test before you require it

Sign out, open the sign-in page, and click the button with your connection's
name. You should land at your provider and come back signed in.

Test with an ordinary member account, not just an owner account. Owners are
deliberately exempt from the *Require SSO* rule below, so an owner signing in
successfully does not prove a member can.

## Requiring SSO

By default, adding a connection **adds** a way to sign in; passwords still work.
Turn on **Require SSO** on the connection when you want your provider to be the
only way in for its domains. From then on, for those email domains:

- the password form stops working, and
- the Google and Microsoft buttons stop working.

That is what makes your directory genuinely authoritative — its MFA, its
conditional access, and its offboarding.

:::caution Two doors stay open, on purpose
**Company owners** can always still sign in with a password, and so can our own
platform support staff. A quality system its owners cannot get into is worse
than one with a weaker sign-in — and your identity provider is precisely the
thing that will be misconfigured or expired at the moment you need to get in and
fix it. Test the connection before turning this on.
:::

Addresses **outside** the listed domains are unaffected, which is how
contractors, auditors and supplier contacts keep signing in normally.

## Keeping it working

**Certificate rollover.** Signing certificates expire, usually every one to three
years, and your provider will email you before it happens. You can paste more
than one certificate into the connection: we accept a sign-in signed by any of
them. So add the new certificate *before* your provider switches, and remove the
old one afterwards — done in that order, there is no outage.

**Starting from the app tile.** Clicking your app's tile in Okta or Entra is off
by default, because that kind of sign-in answers no request of ours and so there
is less we can verify about it. If your people rely on the tile, turn on **Allow
starting from the identity provider** on the connection.

**Turning it all off in a hurry.** The master switch at the top of the page stops
every connection at once, without deleting anything you have configured. It is
the right lever if a provider change breaks sign-in.

## Troubleshooting

Failed sign-ins return you to the sign-in page with a short message. This is what
each one means and where to look.

| Message | What to check |
| --- | --- |
| No identity provider is configured for that email domain | The **Email domains** on the connection do not include this person's domain. |
| Your identity provider's response could not be verified | The **signing certificate** is wrong, or has been rotated at your provider but not here. Re-import the metadata. |
| Your identity provider did not send an email address | The Name ID or `email` attribute mapping in step 2 is missing or wrong. |
| No account here matches that sign-in | The person authenticated successfully but has no account here — invite them first. Also check for a typo between the two addresses. |
| That account is not active | The account exists here but is inactive. Reactivate it under **Users**. |
| Your identity provider returned an email domain this connection does not cover | The address it sent is real but outside the listed domains. Add the domain, or correct the mapping. |
| Start from this sign-in page rather than from your provider's app tile | Someone clicked the app tile while **Allow starting from the identity provider** is off. |
| Single sign-on is turned off for this workspace | The master switch is off, or the connection is still a draft rather than active. |
| Your organisation requires signing in with your identity provider | Expected: **Require SSO** is on and someone tried a password or a social button. |

Two further checks worth making when a sign-in fails without a clear cause:

- **Assignment.** In Entra and Okta, the person must be assigned to the
  application. This is the most common cause of a first test failing.
- **Clock drift.** Sign-ins are time-limited and we allow two minutes of
  difference between your provider's clock and ours. A server whose clock is
  badly out will fail with a verification error.

If a message here does not match what you are seeing, note the exact wording and
the time, and contact support — every failed attempt is recorded with a reason.

## What is recorded

Every SSO sign-in, successful or not, is written to the security log with the
method, the outcome and the reason for any failure. See
[Audit Logs](./audit-logs.md) for how to review them. A burst of failures is worth
looking at: it is what a misconfigured connection and a genuine attack have in
common.

## Related

- [Users](./users.md) — inviting people, and account status
- [Roles and Permissions](./roles-and-permissions.md) — what people can do once signed in
- [Audit Logs](./audit-logs.md) — reviewing sign-in activity
