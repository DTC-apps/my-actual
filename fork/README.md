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

There are only two branches:

| Branch        | What                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `master`      | An exact mirror of upstream `master`. Never commit to it.                                          |
| `custom/main` | `master` plus **all** custom changes. The only branch with custom changes; the VPS builds from it. |

Custom changes are committed straight to `custom/main`. No feature branches and no pull requests:
when a change is done and checked, commit it on `custom/main` and push. Nothing ever goes to
`actualbudget/actual`.

## Custom changes

| Change                  | Files                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Make payment** button | `packages/desktop-client/src/components/accounts/`: `MakePaymentButton.tsx`, `MakePaymentForm.tsx`, `makePayment.ts`, `makePayment.test.ts` (new); `Header.tsx`, `Account.tsx` (a few lines each) |
| Fork docs               | `fork/` (new)                                                                                                                                                                                     |

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

## Checks before pushing a custom change

From the repo root: `yarn typecheck`, `yarn lint` and `yarn test` (see [`AGENTS.md`](../AGENTS.md)).
Commit messages start with `[AI]` when an AI agent wrote them.
