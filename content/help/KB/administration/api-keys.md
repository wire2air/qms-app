---
id: api-keys
title: API Keys (moved)
unlisted: true
description: Personal API keys were retired and replaced by service accounts. This page points you to the current article.
keywords: [API key, service account, integration]
access: public
---

# API Keys have moved to Service Accounts

Personal API keys — keys you created against your own login — were retired in
September 2026. API keys are now issued to **service accounts**: machine identities that
hold their own roles, so an integration keeps working when the person who set it up
leaves, and its activity is recorded against the integration rather than a person.

Existing personal keys no longer exist in the app. To connect an external system, create
a service account with the roles it needs and issue it a key.

See [Service Accounts](./service-accounts.md) for step-by-step instructions on creating a
service account, issuing and using an API key, and disabling or revoking access.
