# Automated 10-Match Playtest Report

## 1. Scope and methodology

This run used deterministic synthetic strategies against the public engine validation and reducer path. It completed exactly 10 seeded matches with distinct seeds and alternating Strategy A / Strategy B assignment.

## 2. Automated-only statement

This was automated synthetic playtesting, not human playtesting. No human opinions, enjoyment ratings, rules-clarity ratings, usability ratings, or preference claims are included.

## 3. Match results

| Match | Seed | Winner | Finish reason | Turns | Recycles | Persistence | Bugs |
| --- | --- | --- | --- | ---: | ---: | --- | ---: |
| 1 | automated-playtest-001 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 2 | automated-playtest-002 | P1 | TARGET_SCORE | 7 | 2 | PASS | 0 |
| 3 | automated-playtest-003 | P1 | TARGET_SCORE | 8 | 3 | PASS | 0 |
| 4 | automated-playtest-004 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 5 | automated-playtest-005 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 6 | automated-playtest-006 | P1 | TARGET_SCORE | 6 | 1 | PASS | 0 |
| 7 | automated-playtest-007 | P1 | TARGET_SCORE | 7 | 1 | PASS | 0 |
| 8 | automated-playtest-008 | P1 | TARGET_SCORE | 7 | 2 | PASS | 0 |
| 9 | automated-playtest-009 | P1 | TARGET_SCORE | 8 | 3 | PASS | 0 |
| 10 | automated-playtest-010 | P2 | TARGET_SCORE | 7 | 2 | PASS | 0 |

## 4. Aggregate statistics

- Completed matches: 10/10
- P1 win rate: 90%
- P2 win rate: 10%
- Draw rate: 0%
- Average turns: 6.8
- Median turns: 7
- Average deterministic duration: 68200 ms

## 5. Card usage frequency

| Card | ID | Uses |
| --- | --- | ---: |
| Playful Dog | A001 | 20 |
| Curious Cat | A002 | 18 |
| Swift Rabbit | A003 | 17 |
| Delicious Bone | S001 | 14 |
| Fresh Carrot | S003 | 10 |
| Colorful Yarn | S002 | 8 |
| Sweet Honey | S004 | 8 |
| Energetic Fish | A006 | 7 |
| Fishing Hook | W005 | 7 |
| Muzzle | W001 | 6 |
| Laser Pointer | W002 | 6 |
| Gentle Bear | A004 | 5 |
| Premium Seeds | S005 | 5 |
| Ground Trap | W003 | 5 |
| Bird Cage | W004 | 4 |
| Quick Swap | X003 | 3 |
| Strong Wind | X004 | 3 |
| Armored Turtle | A007 | 2 |
| Special Fish Food | S006 | 2 |
| Lullaby | X001 | 2 |

## 6. Card score contribution

| Card | ID | Score contribution |
| --- | --- | ---: |
| Playful Dog | A001 | 96 |
| Curious Cat | A002 | 74 |
| Swift Rabbit | A003 | 62 |
| Gentle Bear | A004 | 18 |
| Energetic Fish | A006 | 13 |
| Messenger Bird | A005 | 8 |
| Armored Turtle | A007 | 7 |
| Food Thief | X005 | 2 |

## 7. Finish-reason distribution

- Target-score finishes: 10
- Turn-limit finishes: 0
- Stuck matches: 0

## 8. P1/P2 result distribution

- P1 wins: 9
- P2 wins: 1
- Draws: 0

## 9. Recycle usage

- Average recycle count: 2
- Total recycle count: 20

## 9.1 Evolution usage

- Level 3 evolutions: 14
- Average evolutions per match: 1.4
- Evolution turns: 4, 5, 6, 5, 4, 6, 5, 6, 4, 5, 6, 5, 5, 7
- Matches ending before any evolution: 3

| Card | ID | Level 3 evolutions |
| --- | --- | ---: |
| Playful Dog | A001 | 7 |
| Swift Rabbit | A003 | 5 |
| Curious Cat | A002 | 2 |

## 10. Stuck-state analysis

No stuck states were detected within the 500 accepted-action safety limit.

## 11. Persistence scenario results

| Match | Scenario | Result |
| --- | --- | --- |
| 1 | normal uninterrupted match | PASS |
| 2 | save and resume during ACTION phase | PASS |
| 3 | save and resume during handoff screen with privacy check | PASS |
| 4 | export and import active match log | PASS |
| 5 | refresh/resume simulation twice | PASS |
| 6 | finish, save result to history, delete active save | PASS |
| 7 | history save failure leaves active save recoverable | PASS |
| 8 | history save success plus active-save deletion failure retry | PASS |
| 9 | clipboard-unavailable export fallback path | PASS |
| 10 | normal regression comparison | PASS |

## 12. Repeated rejected actions

No repeated rejected-action pattern was recorded.

## 13. Confirmed bugs by severity

| Severity | Match | Description | Evidence |
| --- | --- | --- | --- |
| - | - | No confirmed automated bugs. | - |

## 14. Repeated objective anomalies

- Preliminary usage signal: A001 20, A002 18, A003 17.
- Preliminary score-contribution signal: A001 96, A002 74, A003 62; requires human verification.

## 15. Potential balance signals requiring human verification

The card usage and score contribution tables are preliminary signals only. The sample is insufficient for any balance conclusion.

## 16. Items that cannot be evaluated without humans

- Rules clarity
- Game fun
- Perceived game length
- Balance feel
- UI clarity and handoff comfort

## 17. Recommendation for the next 10 human-played matches

Run 10 human-played local hot-seat matches using the Thai playtest guide, collect objective logs plus optional ratings, and compare repeated human observations against these automated preliminary signals.
