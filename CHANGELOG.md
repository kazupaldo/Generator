# Changelog

## 1.2.0 — Password Changer export and command naming

- Added the admin-only Password Changer for up to 10 bot-issued account usernames per run.
- Added live progress counts for total, processing, completed, invalid, and error results.
- Added a private `username:new_password` TXT export after a successful Password Changer batch.
- Routed the Password Changer TXT export to the configured New Password Channel instead of sending DMs.
- Added `/password changer` as a Discord command group, plus `/passwordchanger` and `/password-change`.
- Added `+passwordchanger` and `+password-change` prefix commands.
- Added Password Changer type filters for Alts, 30+ Days, 1 Year+, 5 Years+, Dump, and 18+ Age Verified accounts.
- Kept Password Changer input restricted to generated usernames from encrypted bot history; raw `user:pass`, cookie, and TXT uploads are not accepted.
- Improved Roblox CSRF bootstrap, token refresh retry, cookie normalization, request timeouts, rate-limit messages, and API error parsing.
- Documented all Password Changer command forms in the project README.

## 1.1.0 — Smart generation and safer delivery

- Added a pre-generation delivery check so missing DM permissions, channel access, or embed/file permissions are reported before an account is consumed.
- Added a pre-generation stock and daily-limit check to manual generation, dropdown generation, and Generate Again.
- Added smart auto-generation: each cycle refreshes stock and daily limits, skips types that are out of stock or at their per-type limit, rotates through eligible types, and resumes automatically after restock or limit reset.
- Added auto-generation run statistics to the control panel: generated count, skipped/check count, attempt count, last type, and last stock/limit check.
- Added a safe account file when a `.ROBLOSECURITY` cookie is too long for a Discord embed field.
- Added history exports with optional account type, page, and `txt`, `csv`, or `json` formats.
- Normalized multiple BloxGen daily-limit response shapes so `/limits` and auto-generation use the same values.
- Improved setup documentation for rotating the Discord bot token and using the correct BloxGen API key.

## 1.0.0

- Initial Discord bot release with prefix/slash commands, account generation, stock, limits, logging, history, and auto-generation.