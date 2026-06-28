# Automated 10-Match Playtest Report

## 1. Scope and methodology

This run used deterministic synthetic strategies against the public engine validation and reducer path. It completed exactly 10 seeded matches with distinct seeds and alternating Strategy A / Strategy B assignment.

## 2. Automated-only statement

This was automated synthetic playtesting, not human playtesting. No human opinions, enjoyment ratings, rules-clarity ratings, usability ratings, or preference claims are included.

## 3. Match results

| Match | Seed | Starter | Winner | Finish reason | Turns | Recycles | Persistence | Bugs |
| --- | --- | --- | --- | --- | ---: | ---: | --- | ---: |
| 1 | automated-playtest-001 | P2 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 2 | automated-playtest-002 | P1 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 3 | automated-playtest-003 | P2 | P2 | TARGET_SCORE | 7 | 2 | PASS | 0 |
| 4 | automated-playtest-004 | P2 | P2 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 5 | automated-playtest-005 | P1 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 6 | automated-playtest-006 | P1 | P1 | TARGET_SCORE | 5 | 1 | PASS | 0 |
| 7 | automated-playtest-007 | P1 | P1 | TARGET_SCORE | 7 | 0 | PASS | 0 |
| 8 | automated-playtest-008 | P1 | P1 | TARGET_SCORE | 6 | 3 | PASS | 0 |
| 9 | automated-playtest-009 | P1 | P1 | TARGET_SCORE | 6 | 2 | PASS | 0 |
| 10 | automated-playtest-010 | P2 | P1 | TARGET_SCORE | 5 | 2 | PASS | 0 |

## 4. Aggregate statistics

- Completed matches: 10/10
- P1 win rate: 80%
- P2 win rate: 20%
- Draw rate: 0%
- P1 starts: 6
- P2 starts: 4
- Starter wins: 8 (80%)
- Non-starter wins: 2 (20%)
- Non-terminating matches: 0
- Average turns: 6
- Median turns: 6
- Average turns by starter: 6
- Average deterministic duration: 67300 ms

## 5. Card usage frequency

| Card | ID | Uses |
| --- | --- | ---: |
| Playful Dog | A001 | 22 |
| Curious Cat | A002 | 17 |
| Swift Rabbit | A003 | 15 |
| Delicious Bone | S001 | 10 |
| Colorful Yarn | S002 | 8 |
| Fresh Carrot | S003 | 8 |
| Gentle Bear | A004 | 6 |
| Bird Cage | W004 | 6 |
| Fishing Hook | W005 | 6 |
| Armored Turtle | A007 | 5 |
| Ground Trap | W003 | 5 |
| Strong Wind | X004 | 5 |
| Messenger Bird | A005 | 4 |
| Energetic Fish | A006 | 4 |
| Sweet Honey | S004 | 4 |
| Special Fish Food | S006 | 4 |
| Muzzle | W001 | 4 |
| Laser Pointer | W002 | 4 |
| Premium Seeds | S005 | 2 |
| Lullaby | X001 | 2 |

## 6. Card score contribution

| Card | ID | Score contribution |
| --- | --- | ---: |
| Playful Dog | A001 | 62 |
| Curious Cat | A002 | 52 |
| Swift Rabbit | A003 | 33 |
| Gentle Bear | A004 | 14 |
| Messenger Bird | A005 | 11 |
| Energetic Fish | A006 | 7 |
| Armored Turtle | A007 | 5 |
| Clever Monkey | A008 | 1 |

## 7. Finish-reason distribution

- Target-score finishes: 10
- Turn-limit finishes: 0
- Stuck matches: 0

## 8. P1/P2 result distribution

- P1 wins: 8
- P2 wins: 2
- Draws: 0

## 9. Recycle usage

- Average recycle count: 1.8
- Total recycle count: 18

## 9.1 Evolution usage

- Level 3 evolutions: 7
- Average evolutions per match: 0.7
- Evolution turns: 5, 6, 5, 6, 5, 7, 4
- Matches ending before any evolution: 4

| Card | ID | Level 3 evolutions |
| --- | --- | ---: |
| Playful Dog | A001 | 3 |
| Curious Cat | A002 | 2 |
| Swift Rabbit | A003 | 1 |
| Energetic Fish | A006 | 1 |

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

- Action player is not the current player: 4
- MULLIGAN is only valid during READY phase: 5

## 13. Confirmed bugs by severity

| Severity | Match | Description | Evidence |
| --- | --- | --- | --- |
| - | - | No confirmed automated bugs. | - |

## 14. Repeated objective anomalies

- Repeated rejected-action pattern: Action player is not the current player (4).
- Repeated rejected-action pattern: MULLIGAN is only valid during READY phase (5).
- Preliminary usage signal: A001 22, A002 17, A003 15.
- Preliminary score-contribution signal: A001 62, A002 52, A003 33; requires human verification.

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
