# GitHub capability baseline

Read using gh CLI/API on 2026-10-04; no secret values were requested or recorded.

| Capability                      | Observed state                               | Implication                                                                                            |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Repository                      | bjo163/moonwitness-xi, public, admin access  | Can inspect/change settings when an implementation task is ready                                       |
| Default branch                  | main                                         | Issue closing keywords on PR behave specially for default branch; promotion remains dev→main           |
| Remote branch refs              | main and dev                                 | Two-branch bootstrap exists; no extra remote branch observed                                           |
| Issues                          | enabled                                      | M11 can use Issues; creating 148 issues remains gated on reconciler dry-run/pilot                      |
| Repository rulesets             | empty list                                   | No rulesets observed; verify branch protection endpoints before enforcing                              |
| Main branch protection endpoint | API read returned unavailable/not configured | Exact reason (missing rule vs permission/API limitation) needs follow-up before claiming no protection |
| GitHub Pages endpoint           | unavailable/not configured                   | Pages requires explicit bootstrap/settings                                                             |
| Auto-merge                      | disabled                                     | Enable only after required checks and policies work                                                    |
| Merge methods                   | merge, squash and rebase enabled             | M1 should retain merge only if this is the chosen promotion contract                                   |
| Delete branch on merge          | false                                        | Correct for persistent dev branch                                                                      |
| Existing workflows              | CI, Release, Staging deploy                  | CI push trigger needs dev; staging deployment conflicts with current user scope                        |
| Bot credential/App setup        | Not audited/configured                       | Determine minimum installation permission during M8/M11 bootstrap                                      |

This file records observable configuration only. “Unavailable/not configured” is not treated as proof of an absent feature; re-read settings and report the exact API response during settings changes.
