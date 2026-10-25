# DTC-apps/my-actual: fork notes

This is a fork of [actualbudget/actual](https://github.com/actualbudget/actual), self-hosted on
the same VPS as the finance dashboard
([DTC-apps/finance-tracker-dash](https://github.com/DTC-apps/finance-tracker-dash)). Everything
specific to the fork lives in this `fork/` folder, so merging upstream releases never conflicts
with it.

| File                                               | What                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`vps.md`](vps.md)                                 | Running Actual on the VPS: install, update, backups, moving, troubleshooting |
| [`docker-compose.vps.yml`](docker-compose.vps.yml) | The container settings used on the VPS                                       |

## Branches

| Branch             | What                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `master`           | An exact mirror of upstream `master`. Never commit to it.                           |
| `custom/main`      | `master` plus all custom changes. The VPS builds from this branch.                  |
| `custom/<feature>` | One custom change each, made from `custom/main` and merged back with a pull request |

Pull requests from `custom/<feature>` go into `custom/main`, never into `master` and never to
`actualbudget/actual`. GitHub suggests upstream as the target when you open a pull request from a
fork, so check the base repository and branch before creating it.

## Custom changes

| Change                          | Files                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Make payment** button (PR #1) | `packages/desktop-client/src/components/accounts/`: `MakePaymentButton.tsx`, `MakePaymentForm.tsx`, `makePayment.ts`, `makePayment.test.ts` (new); `Header.tsx`, `Account.tsx` (a few lines each) |
| Fork docs                       | `fork/` (new)                                                                                                                                                                                     |

**Make payment:** on an open account with a negative balance (a credit card or loan), the account
toolbar shows **Make payment**. It opens a form prefilled with the amount owed, a source account
(the first open on-budget account by default) and today's date, and records the payment as a
normal transfer. Your rules are not run on the payment, so they can't change its payee. Desktop
and web only; the mobile layout doesn't have it.

Custom changes prefer new files over edits to upstream files, and never touch the data schema,
migrations or sync logic. The fewer upstream lines they change, the fewer conflicts each update
brings.

## Staying current with upstream

On a computer with a clone of this repo (`upstream` is `https://github.com/actualbudget/actual.git`):

```sh
git remote add upstream https://github.com/actualbudget/actual.git   # once
git fetch upstream
git checkout master && git merge --ff-only upstream/master && git push origin master
git checkout custom/main && git merge master && git push origin custom/main
```

If the last merge has conflicts, they are in the few upstream lines a custom change edits (see the
table above). Then update the VPS: [`vps.md`](vps.md), "Updating Actual".

Releases sometimes upgrade Actual's data. Once the VPS runs a newer version, an older image can't
read the data any more, so take the update only when you mean to.

## Checks before merging a custom change

From the repo root: `yarn typecheck`, `yarn lint` and `yarn test` (see [`AGENTS.md`](../AGENTS.md)).
Commit messages and pull request titles start with `[AI]` when an AI agent wrote them.
